import { proxyGet } from './_proxyUtils.js'

/** Same-origin proxy for TCGdex (api.tcgdex.net is blocked on some networks). */
export default async function handler(req, res) {
  await proxyGet(req, res, {
    origin: 'https://api.tcgdex.net/v2',
    mountPrefix: '/api/tcgdex',
    cacheControl: 'public, s-maxage=1800, stale-while-revalidate=86400',
    errorLabel: 'TCGdex upstream unavailable',
    maxAttempts: 4,
  })
}
