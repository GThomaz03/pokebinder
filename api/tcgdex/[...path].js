/** @typedef {import('@vercel/node').VercelRequest} VercelRequest */
/** @typedef {import('@vercel/node').VercelResponse} VercelResponse */

const ORIGIN = 'https://api.tcgdex.net/v2'

/**
 * Serverless proxy for TCGdex — Vercel external rewrites often return 502;
 * this function forwards from the same origin as the SPA.
 */
export default async function handler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const raw = req.query.path
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : []
  const path = segments.map(String).join('/')

  const url = new URL(`${ORIGIN}/${path}`)
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
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400')

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    const body = await upstream.text()
    res.send(body)
  } catch {
    res.status(502).json({ error: 'TCGdex upstream unavailable' })
  }
}
