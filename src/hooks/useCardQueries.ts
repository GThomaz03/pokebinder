import { useQuery } from '@tanstack/react-query'
import { API_CONFIG } from '../api/config'
import {
  fetchSpeciesVariantsRepo,
  getCardById,
  getSetMeta,
  searchCardsAdvancedRepo,
  searchCardsRepo,
  type CardSearchFilters,
} from '../api/cards/cardRepository'
import { getFxRates } from '../api/fx/fxProvider'
import { getPriceQuote, hydrateCard } from '../api/prices/priceRepository'
import type { CardLang, PriceMarket } from '../types'
import { queryKeys } from '../lib/queryClient'
import { parseOwnedKey } from '../api/cardKeys'

/** Shared card + price hydration with React Query deduplication. */
export function useCard(lang: CardLang, cardId: string | undefined, enabled = true) {
  const parsed = cardId ? parseOwnedKey(cardId) : null
  const id = parsed?.cardId
  const fetchLang = parsed?.lang ?? lang

  return useQuery({
    queryKey: queryKeys.card(fetchLang, id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('card id required')
      const card = await hydrateCard(fetchLang, cardId!)
      // Throw so React Query retries instead of caching null as success
      if (!card) throw new Error(`Card unavailable: ${id}`)
      return card
    },
    enabled: Boolean(enabled && id),
    staleTime: API_CONFIG.cache.cardStaleTimeMs,
    retry: 2,
  })
}

export function useNormalizedCard(lang: CardLang, cardId: string | undefined, enabled = true) {
  const id = cardId ? parseOwnedKey(cardId).cardId : undefined
  return useQuery({
    queryKey: [...queryKeys.card(lang, id ?? ''), 'normalized'] as const,
    queryFn: () => (id ? getCardById(lang, id) : null),
    enabled: Boolean(enabled && id),
    staleTime: API_CONFIG.cache.cardStaleTimeMs,
  })
}

export function useCardPrice(
  lang: CardLang,
  cardId: string | undefined,
  opts?: { market?: PriceMarket; variantKey?: string; enabled?: boolean },
) {
  const market = opts?.market ?? 'cardmarket'
  const variantKey = opts?.variantKey ?? null
  const id = cardId ? parseOwnedKey(cardId).cardId : undefined

  return useQuery({
    queryKey: queryKeys.price(lang, id ?? '', variantKey, market),
    queryFn: () =>
      id
        ? getPriceQuote(id, {
            lang,
            market,
            variantKey: variantKey ?? undefined,
          })
        : null,
    enabled: Boolean((opts?.enabled ?? true) && id),
    staleTime: API_CONFIG.cache.priceStaleTimeMs,
  })
}

export function useCardSearch(lang: CardLang, query: string, enabled = true) {
  const q = query.trim()
  return useQuery({
    queryKey: queryKeys.cardSearch(lang, q),
    queryFn: () => searchCardsRepo(lang, q),
    enabled: Boolean(enabled && q.length >= 1),
    staleTime: 1000 * 60 * 5,
  })
}

export function useCardSearchAdvanced(
  lang: CardLang,
  filters: CardSearchFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.cardSearch(lang, filters.name ?? '', filters),
    queryFn: () => searchCardsAdvancedRepo(lang, filters),
    enabled,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCardVariants(
  lang: CardLang,
  dexId: number | undefined,
  speciesName: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.cardVariants(lang, dexId ?? 0, speciesName ?? ''),
    queryFn: () => fetchSpeciesVariantsRepo(lang, dexId!, speciesName!),
    enabled: Boolean(enabled && dexId && speciesName),
    staleTime: API_CONFIG.cache.cardStaleTimeMs,
  })
}

/** FX on demand — only when a price-displaying component mounts this hook. */
export function useFxRates(enabled = true) {
  return useQuery({
    queryKey: queryKeys.fx(),
    queryFn: () => getFxRates(),
    enabled,
    staleTime: API_CONFIG.cache.fxStaleTimeMs,
  })
}

export function useSetMeta(lang: CardLang, setId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.setMeta(lang, setId ?? ''),
    queryFn: () => getSetMeta(lang, setId!),
    enabled: Boolean(enabled && setId),
    staleTime: API_CONFIG.cache.cardStaleTimeMs,
  })
}
