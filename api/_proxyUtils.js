/** @typedef {import('@vercel/node').VercelRequest} VercelRequest */
/** @typedef {import('@vercel/node').VercelResponse} VercelResponse */

/**
 * Resolve upstream path from vercel.json rewrite (?path=…) or req.url fallback.
 * Catch-all `[...path].js` is Next.js-only; flat handlers need this instead.
 */
export function resolveUpstreamPath(req, mountPrefix) {
  const q = req.query.path
  if (q) return Array.isArray(q) ? q.join('/') : String(q)

  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`)
  return url.pathname.replace(new RegExp(`^${mountPrefix}/?`), '')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

function parseRetryAfterMs(header) {
  if (!header) return null
  const sec = Number(header)
  if (Number.isFinite(sec) && sec >= 0) return sec * 1000
  const date = Date.parse(header)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return null
}

/**
 * Fetch upstream with retries on transient Cloudflare / origin errors.
 * @param {string} url
 * @param {RequestInit} init
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} retryOpts
 */
async function fetchUpstream(url, init, retryOpts = {}) {
  const maxAttempts = retryOpts.maxAttempts ?? 4
  const baseDelayMs = retryOpts.baseDelayMs ?? 500

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const upstream = await fetch(url, init)
      if (RETRYABLE_STATUS.has(upstream.status) && attempt < maxAttempts - 1) {
        await upstream.arrayBuffer().catch(() => {})
        const wait =
          parseRetryAfterMs(upstream.headers.get('Retry-After')) ??
          baseDelayMs * 2 ** attempt
        await sleep(wait)
        continue
      }
      return upstream
    } catch {
      if (attempt < maxAttempts - 1) {
        await sleep(baseDelayMs * 2 ** attempt)
        continue
      }
      throw new Error('upstream fetch failed')
    }
  }

  throw new Error('upstream fetch failed')
}

/**
 * @param {VercelRequest} req
 * @param {VercelResponse} res
 * @param {{
 *   origin: string,
 *   mountPrefix: string,
 *   cacheControl: string,
 *   errorLabel: string,
 *   extraHeaders?: Record<string, string>,
 *   maxAttempts?: number,
 * }} opts
 */
export async function proxyGet(req, res, opts) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const path = resolveUpstreamPath(req, opts.mountPrefix)
  const url = new URL(`${opts.origin}/${path}`)

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, String(v))
    } else if (value != null) {
      url.searchParams.set(key, String(value))
    }
  }

  const headers = { Accept: 'application/json', ...opts.extraHeaders }

  try {
    const upstream = await fetchUpstream(
      url.toString(),
      {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
      },
      { maxAttempts: opts.maxAttempts ?? 4, baseDelayMs: 500 },
    )

    res.status(upstream.status)
    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', opts.cacheControl)

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    const body = await upstream.text()
    res.send(body)
  } catch {
    res.status(502).json({ error: opts.errorLabel })
  }
}
