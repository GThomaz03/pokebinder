/** Centralized API / cache configuration for catalog, prices, FX and images. */

export const TCGDEX_ORIGIN = 'https://api.tcgdex.net/v2'

/** Same-origin proxy in browser (Vite dev + Vercel prod); direct origin in Node scripts. */
function tcgdexBaseUrl(): string {
  if (typeof window === 'undefined') return TCGDEX_ORIGIN
  return '/api/tcgdex'
}

export const API_CONFIG = {
  tcgdex: {
    /**
     * Production uses a same-origin Vercel rewrite (`/api/tcgdex`) because
     * `api.tcgdex.net` is unreachable from some networks (ERR_CONNECTION_REFUSED).
     * Images stay on assets.tcgdex.net — that CDN is typically still reachable.
     */
    get baseUrl() {
      return tcgdexBaseUrl()
    },
    assetsBaseUrl: 'https://assets.tcgdex.net',
  },
  pokemonTcgIo: {
    apiBaseUrl: 'https://api.pokemontcg.io/v2',
    imagesBaseUrl: 'https://images.pokemontcg.io',
  },
  fx: {
    eurUrl: 'https://open.er-api.com/v6/latest/EUR',
    usdUrl: 'https://open.er-api.com/v6/latest/USD',
    /** Fallback only when live + cache fail */
    fallbackEurToBrl: 5.8,
    fallbackUsdToBrl: 5.1,
  },
  http: {
    timeoutMs: 10_000,
    maxRetries: 3,
    baseBackoffMs: 400,
  },
  cache: {
    cardStaleTimeMs: 1000 * 60 * 60 * 24, // 24h
    priceStaleTimeMs: 1000 * 60 * 60, // 1h
    fxStaleTimeMs: 1000 * 60 * 60 * 6, // 6h
    persistKey: 'pokebinder-rq-v2',
  },
  storageKeys: {
    cardsLegacy: 'pokebinder-cards-v1',
    pricesLegacy: 'pokebinder-prices-v1',
    fx: 'pokebinder-fx-v1',
    imageUrls: 'pokebinder-img-urls-v1',
  },
} as const
