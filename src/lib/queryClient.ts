import { QueryClient } from '@tanstack/react-query'
import { persistQueryClient, type Persister } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { API_CONFIG } from '../api/config'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: API_CONFIG.cache.cardStaleTimeMs,
      gcTime: API_CONFIG.cache.cardStaleTimeMs * 7,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

export const queryKeys = {
  card: (lang: string, cardId: string) => ['card', lang, cardId] as const,
  cardSearch: (lang: string, query: string, filters?: unknown) =>
    ['card-search', lang, query, filters ?? null] as const,
  cardVariants: (lang: string, dexId: number, species: string) =>
    ['card-variants', lang, dexId, species] as const,
  price: (lang: string, cardId: string, variantKey: string | null, market: string) =>
    ['price', lang, cardId, variantKey, market] as const,
  fx: () => ['fx'] as const,
  setMeta: (lang: string, setId: string) => ['set-meta', lang, setId] as const,
}

function createPersister(): Persister | null {
  if (typeof window === 'undefined') return null
  try {
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: API_CONFIG.cache.persistKey,
    })
  } catch {
    return null
  }
}

const persister = createPersister()
if (persister) {
  persistQueryClient({
    queryClient,
    persister,
    maxAge: API_CONFIG.cache.cardStaleTimeMs * 7,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => {
        const key = query.queryKey[0]
        if (key !== 'card' && key !== 'price' && key !== 'fx' && key !== 'set-meta') {
          return false
        }
        // Never persist empty/failed results — that froze prod slots for 24h staleTime
        return query.state.status === 'success' && query.state.data != null
      },
    },
  })
}
