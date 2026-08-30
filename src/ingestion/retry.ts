/** Retry with exponential backoff + jitter for ingestion HTTP calls. */

export type RetryOptions = {
  maxRetries?: number
  timeoutMs?: number
  baseDelayMs?: number
  rateLimitMs?: number
}

let lastRequestAt = 0

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function jitter(ms: number) {
  return ms + Math.floor(Math.random() * Math.min(500, ms * 0.2))
}

export async function rateLimitedFetch(
  url: string,
  opts: RetryOptions & RequestInit = {},
): Promise<Response> {
  const {
    maxRetries = Number(process.env.SYNC_MAX_RETRIES ?? 4),
    timeoutMs = Number(process.env.SYNC_TIMEOUT ?? 15000),
    baseDelayMs = 1000,
    rateLimitMs = Number(process.env.SYNC_RATE_LIMIT ?? 200),
    ...init
  } = opts

  const gap = Date.now() - lastRequestAt
  if (gap < rateLimitMs) await sleep(rateLimitMs - gap)

  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastRequestAt = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) return res
      if ([502, 503, 504, 429].includes(res.status) && attempt < maxRetries) {
        const retryAfter = res.headers.get('retry-after')
        const wait =
          retryAfter && !Number.isNaN(Number(retryAfter))
            ? Number(retryAfter) * 1000
            : jitter(baseDelayMs * 2 ** attempt)
        await sleep(wait)
        continue
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      if (attempt < maxRetries) {
        await sleep(jitter(baseDelayMs * 2 ** attempt))
        continue
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function fetchJson<T>(
  url: string,
  opts?: RetryOptions,
): Promise<T> {
  const res = await rateLimitedFetch(url, opts)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status} ${url}: ${body.slice(0, 200)}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  return res.json() as Promise<T>
}
