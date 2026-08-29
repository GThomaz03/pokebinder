import type { PriceMarket } from '../../types'

export type PricingBlock = {
  cardmarket?: {
    avg?: number | null
    trend?: number | null
    low?: number | null
    'avg-holo'?: number | null
    'trend-holo'?: number | null
    'low-holo'?: number | null
  }
  tcgplayer?: Record<string, { marketPrice?: number | null } | null> | null
}

const TCGPLAYER_KEYS_BY_VARIANT: Record<string, string[]> = {
  normal: ['normal', 'unlimited'],
  holo: ['holofoil', 'holo', 'unlimited-holofoil'],
  reverse: ['reverse-holofoil', 'reverse'],
  'first-edition': ['1st-edition', '1st-edition-holofoil'],
  firstEdition: ['1st-edition', '1st-edition-holofoil'],
}

const TCGPLAYER_FALLBACK_KEYS = [
  'normal',
  'holofoil',
  'holo',
  'reverse-holofoil',
  'reverse',
  '1st-edition-holofoil',
  '1st-edition',
  'unlimited-holofoil',
  'unlimited',
]

function tcgplayerPrice(
  tp: PricingBlock['tcgplayer'],
  variantType?: string,
): number | null {
  if (!tp || typeof tp !== 'object') return null
  const preferred = variantType ? (TCGPLAYER_KEYS_BY_VARIANT[variantType] ?? []) : []
  for (const key of [...preferred, ...TCGPLAYER_FALLBACK_KEYS]) {
    const p = tp[key]
    if (p?.marketPrice != null) return p.marketPrice
  }
  for (const p of Object.values(tp)) {
    if (p?.marketPrice != null) return p.marketPrice
  }
  return null
}

function cardmarketPrice(
  cm: PricingBlock['cardmarket'],
  variantType?: string,
): number | null {
  if (!cm) return null
  const isFoil = variantType === 'holo' || variantType === 'reverse'
  if (isFoil) {
    return cm['avg-holo'] ?? cm['trend-holo'] ?? cm['low-holo'] ?? cm.avg ?? cm.trend ?? cm.low ?? null
  }
  return cm.avg ?? cm.trend ?? cm.low ?? null
}

/** Extract EUR/USD from a TCGdex pricing block, optionally scoped to a variant type. */
export function extractMarkets(
  pricing?: PricingBlock,
  variantType?: string,
): {
  cardmarket: number | null
  tcgplayer: number | null
} {
  return {
    cardmarket: cardmarketPrice(pricing?.cardmarket, variantType),
    tcgplayer: tcgplayerPrice(pricing?.tcgplayer, variantType),
  }
}

/** Pick variant-specific pricing, falling back to card-level pricing. */
export function pricingForVariant(
  cardPricing: PricingBlock | undefined,
  variantPricing: PricingBlock | undefined,
  _variantType: string,
): PricingBlock | undefined {
  const block = variantPricing ?? cardPricing
  if (!block) return undefined
  return block
}

/** Resolve markets for a variant row with card-level fallback. */
export function extractMarketsForVariant(
  cardPricing: PricingBlock | undefined,
  variantPricing: PricingBlock | undefined,
  variantType: string,
  _market: PriceMarket = 'cardmarket',
): { eur: number | null; usd: number | null } {
  const block = pricingForVariant(cardPricing, variantPricing, variantType)
  const markets = extractMarkets(block, variantType)
  return { eur: markets.cardmarket, usd: markets.tcgplayer }
}
