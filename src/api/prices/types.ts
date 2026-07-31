import type { CardLang, PriceMarket } from '../../types'

/** Known / future price sources. Only `tcgdex` is implemented today. */
export type PriceSource =
  | 'tcgdex'
  | 'justtcg'
  | 'pokewallet'
  | 'brazilian_market'

export type FxSource = 'live' | 'cache' | 'fallback'

export type PriceQuote = {
  cardId: string
  variantKey?: string
  source: PriceSource
  /** Preferred display amount in original market currency */
  amount: number | null
  currency: 'EUR' | 'USD'
  markets: {
    cardmarket?: number | null
    tcgplayer?: number | null
  }
  fxRate?: number
  fxFetchedAt?: number
  fxSource?: FxSource
  convertedAmount?: number | null
  convertedCurrency: 'BRL'
  /** Always true when converted via FX (not a Brazilian market quote) */
  estimated: boolean
  updatedAt: number
}

export type PriceQuoteOptions = {
  lang?: CardLang
  variantKey?: string
  market?: PriceMarket
  /** Raw pricing block from catalog provider when already fetched */
  pricingHint?: {
    cardmarket?: { avg?: number | null; trend?: number | null; low?: number | null }
    tcgplayer?: Record<string, { marketPrice?: number | null } | null> | null
  }
}

export interface PriceProvider {
  readonly id: PriceSource
  getQuote(cardId: string, opts?: PriceQuoteOptions): Promise<PriceQuote | null>
}

/*
 * Future providers (stubs — not implemented):
 * - JustTCGPriceProvider
 * - PokéWalletPriceProvider
 * - BrazilianMarketPriceProvider
 */
