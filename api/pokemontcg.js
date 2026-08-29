import { proxyGet } from './_proxyUtils.js'

/** Same-origin proxy — Pokémon TCG API blocks browser CORS on direct calls. */
export default async function handler(req, res) {
  await proxyGet(req, res, {
    origin: 'https://api.pokemontcg.io/v2',
    mountPrefix: '/api/pokemontcg',
    cacheControl: 'public, s-maxage=900, stale-while-revalidate=3600',
    errorLabel: 'Pokémon TCG API upstream unavailable',
  })
}
