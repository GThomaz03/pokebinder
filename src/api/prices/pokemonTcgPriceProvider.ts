import { extractMarkets } from './pricingExtract'
import { quoteFromPricing } from './tcgdexPriceProvider'
import type { PriceProvider, PriceQuoteOptions, PriceSource } from './types'
import {
  fetchPokemonTcgCardPricing,
  pricingFromPokemonTcgCard,
} from './pokemonTcgPricing'

export const pokemonTcgPriceProvider: PriceProvider = {
  id: 'pokemontcg' as PriceSource,
  async getQuote(cardId, opts: PriceQuoteOptions = {}) {
    if (opts.pricingHint) {
      const hintMarkets = extractMarkets(opts.pricingHint)
      if (hintMarkets.cardmarket != null || hintMarkets.tcgplayer != null) {
        return quoteFromPricing(cardId, opts.pricingHint, {
          ...opts,
          source: 'pokemontcg',
        })
      }
    }

    const card = await fetchPokemonTcgCardPricing(cardId)
    if (!card) return null

    const pricing = pricingFromPokemonTcgCard(card)
    if (!pricing) return null

    const markets = extractMarkets(pricing)
    if (markets.cardmarket == null && markets.tcgplayer == null) return null

    return quoteFromPricing(cardId, pricing, { ...opts, source: 'pokemontcg' })
  },
}
