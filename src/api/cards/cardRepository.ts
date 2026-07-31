import type { CardLang } from '../../types'
import type {
  CardBrief,
  CardProvider,
  CardSearchFilters,
  CardVariant,
  DeckCardMeta,
  DeckSearchHit,
  NormalizedCard,
  SetMeta,
} from './types'
import { tcgdexCardProvider } from './tcgdexCardProvider'

let activeProvider: CardProvider = tcgdexCardProvider

/** Allow swapping catalog provider in tests / future backends. */
export function setCardProvider(provider: CardProvider) {
  activeProvider = provider
}

export function getCardProvider(): CardProvider {
  return activeProvider
}

export async function getCardById(
  lang: CardLang,
  id: string,
): Promise<NormalizedCard | null> {
  try {
    return await activeProvider.getById(lang, id)
  } catch {
    return null
  }
}

export async function searchCardsRepo(
  lang: CardLang,
  query: string,
  page = 1,
): Promise<CardBrief[]> {
  try {
    return await activeProvider.search(lang, query, page)
  } catch {
    return []
  }
}

export async function searchCardsAdvancedRepo(
  lang: CardLang,
  filters: CardSearchFilters,
): Promise<DeckSearchHit[]> {
  try {
    return await activeProvider.searchAdvanced(lang, filters)
  } catch {
    return []
  }
}

export async function listSetsRepo(lang: CardLang) {
  try {
    return await activeProvider.listSets(lang)
  } catch {
    return []
  }
}

export async function getSetMetaRepo(
  lang: CardLang,
  setId: string,
): Promise<SetMeta | null> {
  try {
    return await activeProvider.getSet(lang, setId)
  } catch {
    return null
  }
}

const setMetaCache = new Map<string, SetMeta | null>()
const setMetaInflight = new Map<string, Promise<SetMeta | null>>()

export async function getSetMeta(
  lang: CardLang,
  setId: string,
): Promise<SetMeta | null> {
  const key = `${lang}:${setId}`
  if (setMetaCache.has(key)) return setMetaCache.get(key) ?? null
  const pending = setMetaInflight.get(key)
  if (pending) return pending

  const req = (async () => {
    try {
      const meta = await getSetMetaRepo(lang, setId)
      setMetaCache.set(key, meta)
      if (meta && lang !== 'en') setMetaCache.set(`en:${setId}`, meta)
      return meta
    } finally {
      setMetaInflight.delete(key)
    }
  })()

  setMetaInflight.set(key, req)
  return req
}

export async function getSetsMeta(
  lang: CardLang,
  setIds: string[],
): Promise<Record<string, SetMeta>> {
  const unique = [...new Set(setIds.filter(Boolean))]
  const results = await Promise.all(unique.map((id) => getSetMeta(lang, id)))
  const map: Record<string, SetMeta> = {}
  for (let i = 0; i < unique.length; i++) {
    const meta = results[i]
    if (meta) map[unique[i]!] = meta
  }
  return map
}

export async function fetchSpeciesVariantsRepo(
  lang: CardLang,
  dexId: number,
  speciesName: string,
): Promise<CardVariant[]> {
  try {
    return await activeProvider.fetchSpeciesVariants(lang, dexId, speciesName)
  } catch {
    return []
  }
}

export async function fetchDeckCardMetaRepo(
  lang: CardLang,
  cardId: string,
): Promise<DeckCardMeta | null> {
  try {
    return await activeProvider.fetchDeckCardMeta(lang, cardId)
  } catch {
    return null
  }
}

export async function fetchCardRestRepo(
  lang: CardLang,
  setId: string,
  localId: string,
) {
  try {
    return await activeProvider.fetchCardRest(lang, setId, localId)
  } catch {
    return null
  }
}

export type {
  CardBrief,
  CardSearchFilters,
  CardVariant,
  DeckCardMeta,
  DeckSearchHit,
  NormalizedCard,
  SetMeta,
}
