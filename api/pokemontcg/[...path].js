/** @typedef {import('@vercel/node').VercelRequest} VercelRequest */
/** @typedef {import('@vercel/node').VercelResponse} VercelResponse */

const ORIGIN = 'https://api.pokemontcg.io/v2'

/** Same-origin proxy — Pokémon TCG API blocks browser CORS on direct calls. */
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
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600')

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    const body = await upstream.text()
    res.send(body)
  } catch {
    res.status(502).json({ error: 'Pokémon TCG API upstream unavailable' })
  }
}
