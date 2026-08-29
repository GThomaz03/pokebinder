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

/**
 * @param {VercelRequest} req
 * @param {VercelResponse} res
 * @param {{ origin: string, mountPrefix: string, cacheControl: string, errorLabel: string }} opts
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

  try {
    const upstream = await fetch(url.toString(), {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: { Accept: 'application/json' },
    })

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
