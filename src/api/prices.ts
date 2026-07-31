/**
 * Compatibility barrel — prefer importing from `api/prices/priceRepository`
 * and React Query hooks (`hooks/useCardQueries`).
 */
export {
  cacheVariantPrice,
  ESTIMATED_BRL_HINT,
  ESTIMATED_BRL_LABEL,
  formatEstimatedBrl,
  formatPrice,
  formatPriceBrl,
  getCachedCard,
  getCachedPrice,
  getFxRates,
  getPriceQuote,
  hydrateCard,
  legacyPriceToPartialQuote,
  priceToBrl,
  quoteToLegacyPrice,
  seedCardBrief,
} from './prices/priceRepository'
