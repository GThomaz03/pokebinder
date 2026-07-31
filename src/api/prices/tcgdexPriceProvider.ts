import type { PriceMarket } from '../../types'
import { baseCardId } from '../cardKeys'
import { getFxRates, getCachedFxRates, toBrl } from '../fx/fxProvider'
import type { PriceProvider, PriceQuote, PriceQuoteOptions, PriceSource } from './types'

type PricingBlock = {
  cardmarket?: { avg?: number | null; trend?: number | null; low?: number | null }
  tcgplayer?: Record<string, { marketPrice?: number | null } | null> | null
}

function extractMarkets(pricing?: PricingBlock): {
  cardmarket: number | null
  tcgplayer: number | null
} {
  const cm = pricing?.cardmarket
  const tp = pricing?.tcgplayer
  let usd: number | null = null
  if (tp && typeof tp === 'object') {
    for (const key of ['normal', 'holofoil', 'reverse-holofoil', '1st-edition-holofoil']) {
      const p = tp[key]
      if (p?.marketPrice != null) {
        usd = p.marketPrice
        break
      }
    }
  }
  return {
    cardmarket: cm?.avg ?? cm?.trend ?? cm?.low ?? null,
    tcgplayer: usd,
  }
}

/** Build a PriceQuote from a TCGdex pricing block (+ optional FX). */
export async function quoteFromPricing(
  cardId: string,
  pricing: PricingBlock | undefined,
  opts: PriceQuoteOptions = {},
): Promise<PriceQuote> {
  const markets = extractMarkets(pricing)
  const market: PriceMarket = opts.market ?? 'cardmarket'
  const preferEur = market === 'cardmarket'
  const amount = preferEur
    ? (markets.cardmarket ?? markets.tcgplayer)
    : (markets.tcgplayer ?? markets.cardmarket)
  const currency: 'EUR' | 'USD' =
    preferEur
      ? markets.cardmarket != null
        ? 'EUR'
        : 'USD'
      : markets.tcgplayer != null
        ? 'USD'
        : 'EUR'

  let fxRate: number | undefined
  let fxFetchedAt: number | undefined
  let fxSource = getCachedFxRates().source
  let convertedAmount: number | null = null

  if (amount != null) {
    const fx = await getFxRates()
    fxRate = currency === 'EUR' ? fx.eurToBrl : fx.usdToBrl
    fxFetchedAt = fx.updated
    fxSource = fx.source
    convertedAmount = toBrl(amount, currency, fx)
  }

  return {
    cardId: baseCardId(cardId),
    variantKey: opts.variantKey,
    source: 'tcgdex',
    amount: amount ?? null,
    currency,
    markets: {
      cardmarket: markets.cardmarket,
      tcgplayer: markets.tcgplayer,
    },
    fxRate,
    fxFetchedAt,
    fxSource,
    convertedAmount,
    convertedCurrency: 'BRL',
    estimated: true,
    updatedAt: Date.now(),
  }
}

/** Sync quote using cached FX only (for formatters that cannot await). */
export function quoteFromPricingSync(
  cardId: string,
  pricing: PricingBlock | undefined,
  opts: PriceQuoteOptions = {},
): PriceQuote {
  const markets = extractMarkets(pricing)
  const market: PriceMarket = opts.market ?? 'cardmarket'
  const preferEur = market === 'cardmarket'
  const amount = preferEur
    ? (markets.cardmarket ?? markets.tcgplayer)
    : (markets.tcgplayer ?? markets.cardmarket)
  const currency: 'EUR' | 'USD' =
    preferEur
      ? markets.cardmarket != null
        ? 'EUR'
        : 'USD'
      : markets.tcgplayer != null
        ? 'USD'
        : 'EUR'

  const fx = getCachedFxRates()
  const fxRate = currency === 'EUR' ? fx.eurToBrl : fx.usdToBrl
  const convertedAmount = amount != null ? toBrl(amount, currency, fx) : null

  return {
    cardId: baseCardId(cardId),
    variantKey: opts.variantKey,
    source: 'tcgdex',
    amount: amount ?? null,
    currency,
    markets: {
      cardmarket: markets.cardmarket,
      tcgplayer: markets.tcgplayer,
    },
    fxRate: amount != null ? fxRate : undefined,
    fxFetchedAt: fx.updated || undefined,
    fxSource: fx.source,
    convertedAmount,
    convertedCurrency: 'BRL',
    estimated: true,
    updatedAt: Date.now(),
  }
}

/**
 * TCGdex price provider — uses catalog card fetch for pricing payload.
 * Catalog fetch is injected to avoid circular imports at module init.
 */
export function createTcgdexPriceProvider(
  fetchPricing: (
    lang: string,
    cardId: string,
  ) => Promise<PricingBlock | undefined>,
): PriceProvider {
  return {
    id: 'tcgdex' as PriceSource,
    async getQuote(cardId, opts = {}) {
      const lang = opts.lang ?? 'en'
      if (opts.pricingHint) {
        return quoteFromPricing(cardId, opts.pricingHint, opts)
      }
      const pricing = await fetchPricing(lang, baseCardId(cardId))
      if (!pricing) return null
      return quoteFromPricing(cardId, pricing, opts)
    },
  }
}
