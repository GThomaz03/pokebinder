import type { CardLang } from '../../types'
import type {
  CardBrief,
  CardProvider,
  CardSearchFilters,
  CardVariant,
  DeckCardMeta,
  DeckSearchHit,
  NormalizedCard,
  SetCardBrief,
  SetMeta,
} from './types'
import { tcgdexCardProvider } from './tcgdexCardProvider'
import { isTcgdexAvailable, getCachedTcgdexAvailability } from './tcgdexHealth'
import { getPokemonTcgCardById, searchPokemonTcgCards } from './pokemonTcgProvider'
import { fetchSetsMeta } from '../tcgdex'

let activeProvider: CardProvider = tcgdexCardProvider

export type CatalogSource = 'tcgdex' | 'pokemontcg'

/** Source used by the most recent search / getById (for UI banners). */
let lastCatalogSource: CatalogSource | null = null

export function getLastCatalogSource(): CatalogSource | null {
  return lastCatalogSource
}

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
  if (getCachedTcgdexAvailability() === false) {
    lastCatalogSource = 'pokemontcg'
    return getPokemonTcgCardById(lang, id)
  }

  if (getCachedTcgdexAvailability() === null && !(await isTcgdexAvailable())) {
    lastCatalogSource = 'pokemontcg'
    return getPokemonTcgCardById(lang, id)
  }

  try {
    const card = await activeProvider.getById(lang, id)
    if (card) {
      lastCatalogSource = 'tcgdex'
      return card
    }
  } catch {
    /* try fallback */
  }

  if (!(await isTcgdexAvailable())) {
    const fallback = await getPokemonTcgCardById(lang, id)
    lastCatalogSource = 'pokemontcg'
    return fallback
  }

  lastCatalogSource = 'tcgdex'
  return null
}

export async function searchCardsRepo(
  lang: CardLang,
  query: string,
  page = 1,
): Promise<CardBrief[]> {
  // Skip a known-down TCGdex so add-card search stays responsive during outages.
  if (getCachedTcgdexAvailability() === false) {
    lastCatalogSource = 'pokemontcg'
    return searchPokemonTcgCards(query, page)
  }

  // Cold cache: probe first (≤3s) instead of waiting on multi-call SDK retries.
  if (getCachedTcgdexAvailability() === null && !(await isTcgdexAvailable())) {
    lastCatalogSource = 'pokemontcg'
    return searchPokemonTcgCards(query, page)
  }

  let primary: CardBrief[] = []
  try {
    primary = await activeProvider.search(lang, query, page)
  } catch {
    primary = []
  }

  if (primary.length > 0) {
    lastCatalogSource = 'tcgdex'
    return primary
  }

  // Empty may mean "no matches" or a swallowed TCGdex outage — probe before failover.
  if (await isTcgdexAvailable()) {
    lastCatalogSource = 'tcgdex'
    return primary
  }

  const fallback = await searchPokemonTcgCards(query, page)
  lastCatalogSource = 'pokemontcg'
  return fallback
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
  if (!unique.length) return {}

  const [localeRows, enRows] = await Promise.all([
    fetchSetsMeta(lang),
    lang !== 'en' ? fetchSetsMeta('en') : Promise.resolve([] as SetMeta[]),
  ])

  const byId = new Map<string, SetMeta>()
  for (const s of enRows) byId.set(s.id, s)
  for (const s of localeRows) byId.set(s.id, s)

  const map: Record<string, SetMeta> = {}
  for (const id of unique) {
    const meta = byId.get(id)
    if (meta) {
      map[id] = meta
      setMetaCache.set(`${lang}:${id}`, meta)
    }
  }
  return map
}

const setCardsCache = new Map<string, SetCardBrief[]>()
const setCardsInflight = new Map<string, Promise<SetCardBrief[]>>()

export async function listSetCardsRepo(
  lang: CardLang,
  setId: string,
): Promise<SetCardBrief[]> {
  const key = `${lang}:${setId}`
  const hit = setCardsCache.get(key)
  if (hit) return hit
  const pending = setCardsInflight.get(key)
  if (pending) return pending

  const req = (async () => {
    try {
      const cards = await activeProvider.listSetCards(lang, setId)
      setCardsCache.set(key, cards)
      if (cards.length && lang !== 'en') setCardsCache.set(`en:${setId}`, cards)
      return cards
    } catch {
      return []
    } finally {
      setCardsInflight.delete(key)
    }
  })()

  setCardsInflight.set(key, req)
  return req
}

/** All sets enriched with meta, newest releaseDate first. Excludes TCG Pocket (tcgp) by default. */
export async function listAllSetsMeta(lang: CardLang): Promise<SetMeta[]> {
  const rows = await fetchSetsMeta(lang)
  const physical = rows.filter((s) => s.serieId !== 'tcgp')
  physical.sort((a, b) => {
    const ad = a.releaseDate ?? ''
    const bd = b.releaseDate ?? ''
    if (ad && bd) return bd.localeCompare(ad)
    if (ad) return -1
    if (bd) return 1
    return a.name.localeCompare(b.name, 'pt-BR')
  })
  return physical
}

export async function fetchSpeciesVariantsRepo(
  lang: CardLang,
  dexId: number,
  speciesName: string,
): Promise<CardVariant[]> {
  try {
    const variants = await activeProvider.fetchSpeciesVariants(lang, dexId, speciesName)
    lastCatalogSource = getCachedTcgdexAvailability() === false ? 'pokemontcg' : 'tcgdex'
    return variants
  } catch {
    lastCatalogSource = 'pokemontcg'
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
  SetCardBrief,
  SetMeta,
}
