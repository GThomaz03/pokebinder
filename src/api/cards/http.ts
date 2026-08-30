import { API_CONFIG, TCGDEX_ORIGIN } from '../config'
import {
  getCachedTcgdexAvailability,
  isTcgdexApiUrl,
  markTcgdexAvailable,
  markTcgdexUnavailable,
} from './tcgdexHealth'

export class CatalogError extends Error {
  readonly status?: number
  readonly code: 'timeout' | 'http' | 'network' | 'rate_limit' | 'unknown'

  constructor(
    message: string,
    opts?: { status?: number; code?: CatalogError['code']; cause?: unknown },
  ) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'CatalogError'
    this.status = opts?.status
    this.code = opts?.code ?? 'unknown'
  }
}

export class PriceError extends Error {
  readonly code: 'timeout' | 'http' | 'network' | 'rate_limit' | 'unknown'

  constructor(message: string, opts?: { code?: PriceError['code']; cause?: unknown }) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'PriceError'
    this.code = opts?.code ?? 'unknown'
  }
}

export class FxError extends Error {
  constructor(message: string, opts?: { cause?: unknown }) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'FxError'
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const sec = Number(header)
  if (Number.isFinite(sec) && sec >= 0) return sec * 1000
  const date = Date.parse(header)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return null
}

export type FetchJsonOptions = {
  timeoutMs?: number
  maxRetries?: number
  signal?: AbortSignal
  headers?: Record<string, string>
}

function tcgdxDirectUrl(proxyUrl: string): string | null {
  if (typeof window === 'undefined') return null
  if (!/\/api\/tcgdex(\/|\?|$)/i.test(proxyUrl)) return null
  return proxyUrl.replace(/\/api\/tcgdex/, TCGDEX_ORIGIN)
}

function tcgdxFetchUrls(url: string): string[] {
  const direct = tcgdxDirectUrl(url)
  return direct ? [url, direct] : [url]
}

function shouldTryTcgdexDirect(err: unknown, proxyUrl?: string): boolean {
  if (!(err instanceof CatalogError)) return true
  if (err.code === 'network' || err.code === 'timeout') return true
  if (
    err.status === 404 &&
    proxyUrl &&
    /\/api\/tcgdex(\/|\?|$)/i.test(proxyUrl)
  ) {
    return true
  }
  return err.status === 502 || err.status === 503 || err.status === 504
}

/**
 * fetch JSON with timeout, exponential backoff, and 429 Retry-After support.
 */
export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const urls = tcgdxFetchUrls(url)
  let lastError: unknown

  for (let u = 0; u < urls.length; u++) {
    const tryUrl = urls[u]!
    try {
      return await fetchJsonOnce<T>(tryUrl, opts)
    } catch (err) {
      lastError = err
      if (u < urls.length - 1 && shouldTryTcgdexDirect(err, urls[0])) continue
      throw err
    }
  }

  throw lastError instanceof Error ? lastError : new CatalogError(`Network error: ${url}`, { code: 'network' })
}

async function fetchJsonOnce<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? API_CONFIG.http.timeoutMs
  const maxRetries = opts.maxRetries ?? API_CONFIG.http.maxRetries
  let lastError: unknown

  if (isTcgdexApiUrl(url) && getCachedTcgdexAvailability() === false) {
    throw new CatalogError(`TCGdex unavailable: ${url}`, { code: 'network' })
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    opts.signal?.addEventListener('abort', onAbort)

    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: opts.headers,
      })
      if (res.status === 429) {
        const wait =
          parseRetryAfter(res.headers.get('Retry-After')) ??
          API_CONFIG.http.baseBackoffMs * 2 ** attempt
        if (attempt < maxRetries) {
          await sleep(wait)
          continue
        }
        throw new CatalogError(`Rate limited: ${url}`, {
          status: 429,
          code: 'rate_limit',
        })
      }
      if (!res.ok) {
        // 404 is a normal miss for card lookup — don't retry forever
        if (res.status === 404 || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
          throw new CatalogError(`HTTP ${res.status}: ${url}`, {
            status: res.status,
            code: 'http',
          })
        }
        if (attempt < maxRetries) {
          await sleep(API_CONFIG.http.baseBackoffMs * 2 ** attempt)
          continue
        }
        if (isTcgdexApiUrl(url)) markTcgdexUnavailable()
        throw new CatalogError(`HTTP ${res.status}: ${url}`, {
          status: res.status,
          code: 'http',
        })
      }
      if (isTcgdexApiUrl(url)) markTcgdexAvailable()
      return (await res.json()) as T
    } catch (err) {
      lastError = err
      if (err instanceof CatalogError) {
        if (err.code === 'http' && err.status && err.status < 500 && err.status !== 429) throw err
        if (err.code === 'rate_limit' && attempt >= maxRetries) throw err
      }
      const isAbort =
        err instanceof DOMException
          ? err.name === 'AbortError'
          : err instanceof Error && err.name === 'AbortError'
      if (isAbort && opts.signal?.aborted) {
        throw new CatalogError('Request aborted', { code: 'timeout', cause: err })
      }
      if (isAbort) {
        if (attempt < maxRetries) {
          await sleep(API_CONFIG.http.baseBackoffMs * 2 ** attempt)
          continue
        }
        if (isTcgdexApiUrl(url)) markTcgdexUnavailable()
        throw new CatalogError(`Timeout after ${timeoutMs}ms: ${url}`, {
          code: 'timeout',
          cause: err,
        })
      }
      if (attempt < maxRetries) {
        await sleep(API_CONFIG.http.baseBackoffMs * 2 ** attempt)
        continue
      }
      if (isTcgdexApiUrl(url)) markTcgdexUnavailable()
      throw new CatalogError(`Network error: ${url}`, {
        code: 'network',
        cause: err,
      })
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }

  throw new CatalogError(`Network error: ${url}`, {
    code: 'network',
    cause: lastError,
  })
}

/** Wrap an async SDK call with the same retry/timeout policy. */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: FetchJsonOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? API_CONFIG.http.timeoutMs
  const maxRetries = opts.maxRetries ?? API_CONFIG.http.maxRetries
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    opts.signal?.addEventListener('abort', onAbort)
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fn(controller.signal)
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      const is429 = /429|rate.?limit/i.test(msg)
      if (attempt < maxRetries) {
        await sleep(
          is429
            ? API_CONFIG.http.baseBackoffMs * 2 ** (attempt + 1)
            : API_CONFIG.http.baseBackoffMs * 2 ** attempt,
        )
        continue
      }
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }

  throw new CatalogError('Request failed after retries', {
    code: 'network',
    cause: lastError,
  })
}
