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
import {
  supabaseCardProvider,
  isCatalogPopulated,
  fetchCardsByIds,
} from './supabaseCardProvider'
import { isTcgdexAvailable, getCachedTcgdexAvailability } from './tcgdexHealth'
import { getPokemonTcgCardById, searchPokemonTcgCards } from './pokemonTcgProvider'

let activeProvider: CardProvider = tcgdexCardProvider
let catalogPopulated: boolean | null = null

export type CatalogSource = 'supabase' | 'tcgdex' | 'pokemontcg'

let lastCatalogSource: CatalogSource | null = null

export function getLastCatalogSource(): CatalogSource | null {
  return lastCatalogSource
}

export function setCardProvider(provider: CardProvider) {
  activeProvider = provider
  catalogPopulated = null
}

export function getCardProvider(): CardProvider {
  return activeProvider
}

async function ensureProvider(): Promise<CardProvider> {
  // Re-check while false so a tab open during import picks up the catalog without reload.
  if (catalogPopulated !== true) {
    catalogPopulated = await isCatalogPopulated()
    if (catalogPopulated) activeProvider = supabaseCardProvider
  }
  return activeProvider
}

function usingSupabaseCatalog(): boolean {
  return catalogPopulated === true && activeProvider === supabaseCardProvider
}

function usesSupabase(provider: CardProvider) {
  return provider === supabaseCardProvider
}

/** Batch card metadata from Supabase catalog only (no Pokémon TCG / TCGdex). */
export async function getCardsByIdsRepo(
  lang: CardLang,
  ids: string[],
): Promise<Map<string, NormalizedCard>> {
  const unique = [...new Set(ids.filter(Boolean).map((id) => id.toLowerCase()))]
  if (!unique.length) return new Map()

  const provider = await ensureProvider()
  if (usesSupabase(provider)) {
    lastCatalogSource = 'supabase'
    return fetchCardsByIds(lang, unique)
  }
  return new Map()
}

export async function getCardById(
  lang: CardLang,
  id: string,
): Promise<NormalizedCard | null> {
  const provider = await ensureProvider()
  if (usesSupabase(provider)) {
    lastCatalogSource = 'supabase'
    try {
      const card = await provider.getById(lang, id)
      if (card) return card
    } catch {
      /* fall through only when catalog empty */
    }
    if (usingSupabaseCatalog()) return null
  }

  if (usingSupabaseCatalog()) return null

  if (getCachedTcgdexAvailability() === false) {
    lastCatalogSource = 'pokemontcg'
    return getPokemonTcgCardById(lang, id)
  }

  if (getCachedTcgdexAvailability() === null && !(await isTcgdexAvailable())) {
    lastCatalogSource = 'pokemontcg'
    return getPokemonTcgCardById(lang, id)
  }

  try {
    const card = await tcgdexCardProvider.getById(lang, id)
    if (card) {
      lastCatalogSource = 'tcgdex'
      return card
    }
  } catch {
    /* try fallback */
  }

  if (!(await isTcgdexAvailable())) {
    lastCatalogSource = 'pokemontcg'
    return getPokemonTcgCardById(lang, id)
  }

  lastCatalogSource = 'tcgdex'
  return null
}

export async function searchCardsRepo(
  lang: CardLang,
  query: string,
  page = 1,
): Promise<CardBrief[]> {
  const provider = await ensureProvider()
  if (usesSupabase(provider)) {
    lastCatalogSource = 'supabase'
    try {
      const rows = await provider.search(lang, query, page)
      if (rows.length) return rows
    } catch {
      /* external fallback below only if empty catalog path */
    }
    if (catalogPopulated) return []
  }

  if (getCachedTcgdexAvailability() === false) {
    lastCatalogSource = 'pokemontcg'
    return searchPokemonTcgCards(query, page)
  }

  if (getCachedTcgdexAvailability() === null && !(await isTcgdexAvailable())) {
    lastCatalogSource = 'pokemontcg'
    return searchPokemonTcgCards(query, page)
  }

  let primary: CardBrief[] = []
  try {
    primary = await tcgdexCardProvider.search(lang, query, page)
  } catch {
    primary = []
  }

  if (primary.length > 0) {
    lastCatalogSource = 'tcgdex'
    return primary
  }

  if (await isTcgdexAvailable()) {
    lastCatalogSource = 'tcgdex'
    return primary
  }

  lastCatalogSource = 'pokemontcg'
  return searchPokemonTcgCards(query, page)
}

export async function searchCardsAdvancedRepo(
  lang: CardLang,
  filters: CardSearchFilters,
): Promise<DeckSearchHit[]> {
  const provider = await ensureProvider()
  try {
    return await provider.searchAdvanced(lang, filters)
  } catch {
    return []
  }
}

export async function listSetsRepo(lang: CardLang) {
  const provider = await ensureProvider()
  try {
    return await provider.listSets(lang)
  } catch {
    return []
  }
}

export async function getSetMetaRepo(
  lang: CardLang,
  setId: string,
): Promise<SetMeta | null> {
  const provider = await ensureProvider()
  try {
    return await provider.getSet(lang, setId)
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

  const provider = await ensureProvider()
  if (usesSupabase(provider)) {
    const map: Record<string, SetMeta> = {}
    await Promise.all(
      unique.map(async (id) => {
        const meta = await getSetMeta(lang, id)
        if (meta) map[id] = meta
      }),
    )
    return map
  }

  const { fetchSetsMeta } = await import('../tcgdex')
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
      const provider = await ensureProvider()
      const cards = await provider.listSetCards(lang, setId)
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
  const provider = await ensureProvider()
  if (usesSupabase(provider)) {
    const rows = await provider.listSets(lang)
    const metas: SetMeta[] = []
    for (const s of rows) {
      const meta = await provider.getSet(lang, s.id)
      if (meta && meta.serieId !== 'tcgp') metas.push(meta)
    }
    metas.sort((a, b) => {
      const ad = a.releaseDate ?? ''
      const bd = b.releaseDate ?? ''
      if (ad && bd) return bd.localeCompare(ad)
      if (ad) return -1
      if (bd) return 1
      return a.name.localeCompare(b.name, 'pt-BR')
    })
    return metas
  }

  const { fetchSetsMeta } = await import('../tcgdex')
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
  const provider = await ensureProvider()
  try {
    const variants = await provider.fetchSpeciesVariants(lang, dexId, speciesName)
    lastCatalogSource = usesSupabase(provider) ? 'supabase' : 'tcgdex'
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
  const provider = await ensureProvider()
  try {
    return await provider.fetchDeckCardMeta(lang, cardId)
  } catch {
    return null
  }
}

export async function fetchCardRestRepo(
  lang: CardLang,
  setId: string,
  localId: string,
) {
  const provider = await ensureProvider()
  try {
    return await provider.fetchCardRest(lang, setId, localId)
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
