/** Centralized API / cache configuration for catalog, prices, FX and images. */

export const API_CONFIG = {
  tcgdex: {
    baseUrl: 'https://api.tcgdex.net/v2',
    assetsBaseUrl: 'https://assets.tcgdex.net',
  },
  pokemonTcgIo: {
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
