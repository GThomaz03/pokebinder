import type { CardLang } from '../../types'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { catalogCardIdCandidates, baseCardId } from '../cardKeys'
import {
  CATALOG_FETCH_PAGE_SIZE,
  CATALOG_SEARCH_PAGE_SIZE,
  canonicalIdLikePrefix,
  categoryAliases,
  compareLocalIds,
  dbLanguageValues,
  numberSearchVariants,
  printingLanguage,
  sanitizeSearchTerm,
  setSourceIdCandidates,
  typeAliases,
} from './catalogQuery'
import type {
  CardBrief,
  CardProvider,
  CardVariant,
  DeckCardMeta,
  DeckSearchHit,
  NormalizedCard,
  SetCardBrief,
  SetMeta,
} from './types'

type DbCard = {
  canonical_id: string
  name: string
  number: string | null
  image_high_url: string | null
  image_low_url: string | null
  image_url: string | null
  rarity: string | null
  types: string[] | null
  national_pokedex_numbers: number[] | null
  category: string | null
  stage: string | null
  trainer_type: string | null
  energy_type: string | null
  effect: string | null
  hp: number | null
  regulation_mark: string | null
  legalities: Record<string, boolean> | null
  artist: string | null
  language: string
  sets?: {
    source_id: string
    name: string
    en_name: string | null
    pt_name: string | null
    jp_name: string | null
    serie_slug: string | null
  } | null
}

function asDbCard(row: unknown): DbCard {
  const r = row as Record<string, unknown>
  const sets = r.sets
  const setObj = Array.isArray(sets) ? sets[0] : sets
  return { ...(r as DbCard), sets: setObj as DbCard['sets'] }
}

function langToDb(lang: CardLang): string {
  if (lang === 'pt') return 'pt-BR'
  return lang
}

function pickName(card: DbCard, lang: CardLang, translation?: { name: string } | null): string {
  if (translation?.name) return translation.name
  if (lang === 'pt' && card.sets?.pt_name) return card.name
  return card.name
}

function mapCard(row: DbCard, lang: CardLang, tr?: { name: string } | null): NormalizedCard {
  const image =
    row.image_high_url ?? row.image_low_url ?? row.image_url ?? undefined
  return {
    id: row.canonical_id,
    name: pickName(row, lang, tr),
    localId: row.number ?? '',
    lang,
    image,
    imageBase: row.image_url ?? undefined,
    setId: row.sets?.source_id,
    setName: lang === 'pt' ? (row.sets?.pt_name ?? row.sets?.name) : row.sets?.en_name ?? row.sets?.name,
    illustrator: row.artist ?? undefined,
    rarity: row.rarity ?? undefined,
    types: row.types ?? undefined,
    dexId: row.national_pokedex_numbers ?? undefined,
    category: row.category ?? undefined,
    stage: row.stage ?? undefined,
    trainerType: row.trainer_type ?? undefined,
    energyType: row.energy_type ?? undefined,
    regulationMark: row.regulation_mark ?? undefined,
    legalStandard: row.legalities?.standard,
    legalExpanded: row.legalities?.expanded,
    effect: row.effect ?? undefined,
    hp: row.hp ?? undefined,
  }
}

function mapBrief(row: DbCard, lang: CardLang, tr?: { name: string } | null): CardBrief {
  return {
    id: row.canonical_id,
    name: pickName(row, lang, tr),
    localId: row.number ?? '',
    image: row.image_low_url ?? row.image_high_url ?? row.image_url ?? undefined,
    setId: row.sets?.source_id,
  }
}

async function fetchTranslation(cardIds: string[], lang: CardLang) {
  const out = new Map<string, { name: string }>()
  if (!supabase || !cardIds.length) return out
  for (let i = 0; i < cardIds.length; i += BATCH_CHUNK) {
    const chunk = await fetchTranslationChunk(cardIds.slice(i, i + BATCH_CHUNK), lang)
    for (const [id, value] of chunk) out.set(id, value)
  }
  return out
}

async function fetchTranslationChunk(cardIds: string[], lang: CardLang) {
  if (!supabase || !cardIds.length) return new Map<string, { name: string }>()
  const dbLang = langToDb(lang)
  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, canonical_id')
    .in('canonical_id', cardIds)
  if (error) throw new Error(error.message)
  const idByCanonical = new Map((cards ?? []).map((c) => [c.canonical_id, c.id]))
  const uuids = [...idByCanonical.values()]
  if (!uuids.length) return new Map<string, { name: string }>()
  const { data: trs, error: trError } = await supabase
    .from('card_translations')
    .select('card_id, name')
    .in('card_id', uuids)
    .eq('language', dbLang)
  if (trError) throw new Error(trError.message)
  const byUuid = new Map((trs ?? []).map((t) => [t.card_id, t]))
  const out = new Map<string, { name: string }>()
  for (const [canonical, uuid] of idByCanonical) {
    const t = byUuid.get(uuid)
    if (t) out.set(canonical, t)
  }
  return out
}

const CARD_SELECT = `
  canonical_id, name, number, image_high_url, image_low_url, image_url,
  rarity, types, national_pokedex_numbers, category, stage, trainer_type,
  energy_type, effect, hp, regulation_mark, legalities, artist, language,
  sets (source_id, name, en_name, pt_name, jp_name, serie_slug)
`

const BATCH_CHUNK = 100

/** Batch lookup for export / bulk UI — Supabase only, no external APIs. */
export async function fetchCardsByIds(
  lang: CardLang,
  ids: string[],
): Promise<Map<string, NormalizedCard>> {
  const result = new Map<string, NormalizedCard>()
  if (!supabase || !ids.length) return result

  const requestedIds = [...new Set(ids.map((id) => baseCardId(id)))]
  const candidatesByRequested = new Map<string, string[]>()
  const allCandidates = new Set<string>()

  for (const reqId of requestedIds) {
    const cands = catalogCardIdCandidates(reqId)
    candidatesByRequested.set(reqId, cands)
    for (const c of cands) allCandidates.add(c)
  }

  const canonicalToCard = new Map<string, NormalizedCard>()
  const candidateList = [...allCandidates]

  for (let i = 0; i < candidateList.length; i += BATCH_CHUNK) {
    const chunk = candidateList.slice(i, i + BATCH_CHUNK)
    const { data, error } = await supabase
      .from('cards')
      .select(CARD_SELECT)
      .in('canonical_id', chunk)
    if (error || !data?.length) continue

    const trs = await fetchTranslation(
      data.map((d) => d.canonical_id),
      lang,
    )
    for (const row of data) {
      const card = mapCard(asDbCard(row), lang, trs.get(row.canonical_id))
      canonicalToCard.set(row.canonical_id, card)
    }
  }

  for (const reqId of requestedIds) {
    for (const cid of candidatesByRequested.get(reqId) ?? []) {
      const hit = canonicalToCard.get(cid)
      if (hit) {
        result.set(reqId, hit)
        break
      }
    }
  }

  return result
}

type DbSet = {
  id: string
  source_id: string
  name: string
  pt_name: string | null
  en_name: string | null
  jp_name: string | null
  logo_url: string | null
  symbol_url: string | null
  total_cards: number | null
  official_total: number | null
  release_date: string | null
  serie_slug: string | null
}

const SET_SELECT =
  'id, source_id, name, pt_name, en_name, jp_name, logo_url, symbol_url, total_cards, official_total, release_date, serie_slug'

function setDisplayName(row: DbSet, lang: CardLang): string {
  if (lang === 'pt') return row.pt_name ?? row.name
  return row.en_name ?? row.name
}

function mapSetMeta(row: DbSet, lang: CardLang): SetMeta {
  return {
    id: row.source_id,
    name: setDisplayName(row, lang),
    logo: row.logo_url ?? undefined,
    symbol: row.symbol_url ?? undefined,
    cardCount: row.total_cards ?? 0,
    cardCountOfficial: row.official_total ?? undefined,
    releaseDate: row.release_date ?? undefined,
    serieName: row.serie_slug ?? undefined,
    serieId: row.serie_slug ?? undefined,
  }
}

async function fetchAllSets(): Promise<DbSet[]> {
  if (!supabase) return []
  const all: DbSet[] = []
  for (let from = 0; ; from += CATALOG_FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sets')
      .select(SET_SELECT)
      .order('release_date', { ascending: false, nullsFirst: false })
      .order('source_id', { ascending: true })
      .range(from, from + CATALOG_FETCH_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as DbSet[]
    all.push(...rows)
    if (rows.length < CATALOG_FETCH_PAGE_SIZE) return all
  }
}

export async function listCatalogSetRows() {
  const rows = await fetchAllSets()
  return rows.map((row) => ({
    sourceId: row.source_id,
    name: row.name,
    ptName: row.pt_name,
    enName: row.en_name,
    jpName: row.jp_name,
    logoUrl: row.logo_url,
    symbolUrl: row.symbol_url,
    cardCount: row.total_cards ?? 0,
    officialTotal: row.official_total,
    releaseDate: row.release_date,
    serieSlug: row.serie_slug,
  }))
}

async function findSetRow(setId: string): Promise<DbSet | null> {
  if (!supabase) return null
  for (const candidate of setSourceIdCandidates(setId)) {
    const { data, error } = await supabase
      .from('sets')
      .select(SET_SELECT)
      .eq('source_id', candidate)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return data as DbSet
  }
  return null
}

function hitFromCard(row: DbCard, lang: CardLang, translatedName?: string): DeckSearchHit {
  const brief = mapBrief(row, lang, translatedName ? { name: translatedName } : null)
  return {
    ...brief,
    category: row.category ?? undefined,
    types: row.types ?? undefined,
    stage: row.stage ?? undefined,
    rarity: row.rarity ?? undefined,
    setName: row.sets?.name,
    setId: row.sets?.source_id ?? brief.setId,
    trainerType: row.trainer_type ?? undefined,
    energyType: row.energy_type ?? undefined,
    regulationMark: row.regulation_mark ?? undefined,
    hp: row.hp ?? undefined,
  }
}

function matchesSearchFilters(
  hit: DeckSearchHit,
  opts: { category?: string; type?: string },
): boolean {
  if (opts.category && !categoryAliases(opts.category).includes(hit.category ?? '')) return false
  if (opts.type && !(hit.types ?? []).some((type) => typeAliases(opts.type!).includes(type))) return false
  return true
}

/** Name search uses the trigram indexes on `cards.name` and `card_translations.name`. */
async function searchByName(
  lang: CardLang,
  text: string,
  opts: { category?: string; type?: string },
  page: number,
  pageSize: number,
): Promise<DeckSearchHit[]> {
  if (!supabase) return []
  const from = (page - 1) * pageSize
  const needed = from + pageSize
  let cardsQuery = supabase.from('cards').select(CARD_SELECT).ilike('name', `%${text}%`)
  if (opts.category) cardsQuery = cardsQuery.in('category', categoryAliases(opts.category))
  if (opts.type) cardsQuery = cardsQuery.overlaps('types', typeAliases(opts.type))

  const [cardsRes, translationsRes] = await Promise.all([
    cardsQuery.order('canonical_id', { ascending: true }).range(0, needed),
    supabase
      .from('card_translations')
      .select(
        'name, language, cards!inner(canonical_id, name, number, image_low_url, image_high_url, image_url, category, types, stage, rarity, trainer_type, energy_type, regulation_mark, hp, sets(source_id, name))',
      )
      .ilike('name', `%${text}%`)
      .limit((needed + 1) * 3),
  ])
  if (cardsRes.error) throw new Error(cardsRes.error.message)
  if (translationsRes.error) throw new Error(translationsRes.error.message)

  const byId = new Map<string, DeckSearchHit>()
  for (const raw of cardsRes.data ?? []) {
    const hit = hitFromCard(asDbCard(raw), lang)
    if (matchesSearchFilters(hit, opts)) byId.set(hit.id, hit)
  }
  for (const row of translationsRes.data ?? []) {
    const card = asDbCard(row.cards)
    const preferred = row.language === langToDb(lang) ? row.name : undefined
    const existing = byId.get(card.canonical_id)
    if (!existing) {
      const hit = hitFromCard(card, lang, preferred ?? row.name)
      if (matchesSearchFilters(hit, opts)) byId.set(hit.id, hit)
      continue
    }
    if (preferred) existing.name = preferred
  }

  return [...byId.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(from, from + pageSize)
}

async function querySearchView(
  lang: CardLang,
  opts: { text?: string; numbers?: string[]; category?: string; type?: string },
  page: number,
  pageSize: number,
): Promise<DeckSearchHit[]> {
  if (!supabase) return []
  if (opts.text) return searchByName(lang, opts.text, opts, page, pageSize)

  const from = (page - 1) * pageSize
  let builder = supabase.from('cards').select(CARD_SELECT)
  if (opts.numbers?.length) builder = builder.in('number', opts.numbers)
  if (opts.category) builder = builder.in('category', categoryAliases(opts.category))
  if (opts.type) builder = builder.overlaps('types', typeAliases(opts.type))

  const { data, error } = await builder
    .order('canonical_id', { ascending: true })
    .range(from, from + pageSize - 1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []).map(asDbCard)
  const trs = await fetchTranslation(rows.map((row) => row.canonical_id), lang)
  return rows.map((row) => hitFromCard(row, lang, trs.get(row.canonical_id)?.name))
}

/** One round trip per page of sets. Used by the collection browser. */
export async function listSupabaseSetMetas(lang: CardLang): Promise<SetMeta[]> {
  const rows = await fetchAllSets()
  return rows.map((row) => mapSetMeta(row, lang))
}

export const supabaseCardProvider: CardProvider = {
  async getById(lang, id) {
    if (!supabase) return null
    for (const cid of catalogCardIdCandidates(id)) {
      const { data, error } = await supabase
        .from('cards')
        .select(CARD_SELECT)
        .eq('canonical_id', cid)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) continue
      const trs = await fetchTranslation([data.canonical_id], lang)
      return mapCard(asDbCard(data), lang, trs.get(data.canonical_id))
    }
    return null
  },

  async search(lang, query, page = 1) {
    if (!supabase) return []
    const q = query.trim()
    if (!q) return []

    const compact = q.replace(/\s+/g, '')
    if (/^([a-z0-9.]+)-(\d+[a-zA-Z]?)$/i.test(compact)) {
      if (page > 1) return []
      for (const cid of catalogCardIdCandidates(compact)) {
        const { data, error } = await supabase
          .from('cards')
          .select(CARD_SELECT)
          .eq('canonical_id', cid)
          .limit(1)
        if (error) throw new Error(error.message)
        if (data?.length) {
          const trs = await fetchTranslation([data[0].canonical_id], lang)
          return [mapBrief(asDbCard(data[0]), lang, trs.get(data[0].canonical_id))]
        }
      }
    }

    const numbers = numberSearchVariants(q)
    if (numbers.length) {
      return querySearchView(lang, { numbers }, page, CATALOG_SEARCH_PAGE_SIZE)
    }

    const safe = sanitizeSearchTerm(q)
    if (!safe) return []
    return querySearchView(lang, { text: safe }, page, CATALOG_SEARCH_PAGE_SIZE)
  },

  async searchAdvanced(lang, filters) {
    if (!supabase) return []
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 48
    const rawName = filters.name?.trim() ?? ''
    const numbers = rawName ? numberSearchVariants(rawName) : []
    const text = rawName && !numbers.length ? sanitizeSearchTerm(rawName) : undefined
    if (rawName && !numbers.length && !text) return []
    return querySearchView(
      lang,
      {
        text,
        numbers: numbers.length ? numbers : undefined,
        category: filters.category || undefined,
        type: filters.type || undefined,
      },
      page,
      pageSize,
    )
  },

  async listSets(lang) {
    const rows = await fetchAllSets()
    return rows.map((row) => ({ id: row.source_id, name: setDisplayName(row, lang) }))
  },

  async getSet(lang, setId) {
    const row = await findSetRow(setId)
    return row ? mapSetMeta(row, lang) : null
  },

  async listSetCards(lang, setId) {
    if (!supabase) return []
    const setRow = await findSetRow(setId)
    if (!setRow) return []

    const pattern = canonicalIdLikePrefix(setRow.source_id)
    const rows: DbCard[] = []
    for (let from = 0; ; from += CATALOG_FETCH_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('cards')
        .select('canonical_id, name, number, image_low_url, image_high_url, image_url')
        .like('canonical_id', pattern)
        .order('canonical_id', { ascending: true })
        .range(from, from + CATALOG_FETCH_PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      const pageRows = (data ?? []).map(asDbCard)
      rows.push(...pageRows)
      if (pageRows.length < CATALOG_FETCH_PAGE_SIZE) break
    }

    const trs = await fetchTranslation(
      rows.map((row) => row.canonical_id),
      lang,
    )
    return rows
      .map(
        (row): SetCardBrief => ({
          id: row.canonical_id,
          name: trs.get(row.canonical_id)?.name ?? row.name,
          localId: row.number ?? '',
          image: row.image_low_url ?? row.image_high_url ?? row.image_url ?? undefined,
          setId: setRow.source_id,
        }),
      )
      .sort((a, b) => compareLocalIds(a.localId, b.localId) || a.id.localeCompare(b.id))
  },

  async fetchSpeciesVariants(lang, dexId, speciesName) {
    if (!supabase) return []
    const rows: DbCard[] = []
    for (let from = 0; ; from += CATALOG_FETCH_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('cards')
        .select(CARD_SELECT)
        .contains('national_pokedex_numbers', [dexId])
        .in('language', dbLanguageValues(lang))
        .order('canonical_id', { ascending: true })
        .range(from, from + CATALOG_FETCH_PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      const pageRows = (data ?? []).map(asDbCard)
      rows.push(...pageRows)
      if (pageRows.length < CATALOG_FETCH_PAGE_SIZE) break
    }

    if (rows.length) return mapVariants(rows, lang)

    const token = speciesName.split(' ')[0]?.trim()
    if (!token) return []
    const { data: byName, error: nameError } = await supabase
      .from('cards')
      .select(CARD_SELECT)
      .ilike('name', `%${sanitizeSearchTerm(token)}%`)
      .in('language', dbLanguageValues(lang))
      .order('canonical_id', { ascending: true })
      .limit(CATALOG_FETCH_PAGE_SIZE)
    if (nameError) throw new Error(nameError.message)
    if (!byName?.length) return []
    return mapVariants(byName.map(asDbCard), lang)
  },

  async fetchDeckCardMeta(lang, cardId) {
    const card = await supabaseCardProvider.getById(lang, cardId)
    if (!card) return null
    const rawCat = String(card.category ?? '')
    const category =
      rawCat === 'Trainer' || rawCat === 'Treinador'
        ? 'Trainer'
        : rawCat === 'Energy' || rawCat === 'Energia'
          ? 'Energy'
          : 'Pokemon'
    const name = card.name
    const energyLower = card.energyType?.toLowerCase() ?? ''
    const isBasicEnergy =
      category === 'Energy' &&
      (energyLower === 'normal' ||
        energyLower === 'basic' ||
        /energy|energia/i.test(name))
    return {
      cardId: card.id,
      name,
      category,
      types: card.types,
      stage: card.stage,
      rarity: card.rarity,
      setId: card.setId,
      setName: card.setName,
      localId: card.localId,
      image: card.image,
      regulationMark: card.regulationMark,
      legalStandard: card.legalStandard,
      legalExpanded: card.legalExpanded,
      trainerType: card.trainerType,
      energyType: card.energyType,
      effect: card.effect,
      isBasicEnergy: Boolean(isBasicEnergy),
      isAceSpec: /ace\s*spec/i.test(`${card.rarity ?? ''} ${card.effect ?? ''}`),
      isRadiant: /^(radiant|radiante)\b/i.test(name.trim()),
    } satisfies DeckCardMeta
  },

  async fetchCardRest(lang, setId, localId) {
    if (!supabase) return null
    const { data: setRow } = await supabase.from('sets').select('id, name, source_id').eq('source_id', setId).maybeSingle()
    if (!setRow) return null
    const { data } = await supabase
      .from('cards')
      .select('canonical_id, name, number, image_low_url, image_high_url')
      .eq('set_id', setRow.id)
      .eq('number', String(localId))
      .maybeSingle()
    if (!data) return null
    const trs = await fetchTranslation([data.canonical_id], lang)
    return {
      id: data.canonical_id,
      name: trs.get(data.canonical_id)?.name ?? data.name,
      localId: data.number ?? String(localId),
      image: data.image_low_url ?? data.image_high_url ?? undefined,
      set: { id: setRow.source_id, name: setRow.name },
    }
  },
}

function setLabel(sets: DbCard['sets'], lang: CardLang): string | undefined {
  if (!sets) return undefined
  if (lang === 'pt') return sets.pt_name?.trim() || sets.name
  if (lang === 'ja') return sets.jp_name?.trim() || sets.name
  return sets.en_name?.trim() || sets.name
}

async function mapVariants(cards: DbCard[], lang: CardLang): Promise<CardVariant[]> {
  if (!supabase || !cards.length) return []
  const ids = cards.map((c) => c.canonical_id)
  const trs = await fetchTranslation(ids, lang)

  const uuidByCanonical = new Map<string, string>()
  const canonicalByUuid = new Map<string, string>()
  for (let i = 0; i < ids.length; i += BATCH_CHUNK) {
    const chunk = ids.slice(i, i + BATCH_CHUNK)
    const { data: cardRows, error } = await supabase
      .from('cards')
      .select('id, canonical_id')
      .in('canonical_id', chunk)
    if (error) throw new Error(error.message)
    for (const row of cardRows ?? []) {
      uuidByCanonical.set(row.canonical_id, row.id)
      canonicalByUuid.set(row.id, row.canonical_id)
    }
  }

  const variantsByCard = new Map<string, string[]>()
  const uuids = [...uuidByCanonical.values()]
  for (let i = 0; i < uuids.length; i += BATCH_CHUNK) {
    const chunk = uuids.slice(i, i + BATCH_CHUNK)
    const { data: allVariants, error } = await supabase
      .from('card_variants')
      .select('card_id, variant_type')
      .in('card_id', chunk)
    if (error) throw new Error(error.message)
    for (const variant of allVariants ?? []) {
      const canonical = canonicalByUuid.get(variant.card_id)
      if (!canonical) continue
      const list = variantsByCard.get(canonical) ?? []
      list.push(variant.variant_type)
      variantsByCard.set(canonical, list)
    }
  }

  const out: CardVariant[] = []
  for (const c of cards) {
    const printing = printingLanguage(c.language)
    const types = variantsByCard.get(c.canonical_id)?.length
      ? variantsByCard.get(c.canonical_id)!
      : ['normal']
    for (const vt of types) {
      out.push({
        key: `${c.canonical_id}::${vt}`,
        cardId: c.canonical_id,
        name: (printing === lang ? trs.get(c.canonical_id)?.name : undefined) ?? c.name,
        localId: c.number ?? '',
        image: c.image_low_url ?? c.image_high_url ?? undefined,
        setName: setLabel(c.sets, printing),
        setId: c.sets?.source_id,
        variant: vt,
        variantLabel: vt,
        lang: printing,
        priceKey: `${c.canonical_id}::${vt}`,
      })
    }
  }
  return out
}

/** True when catalog has at least one card (used for provider selection). */
export async function isCatalogPopulated(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { data, error } = await supabase.from('cards').select('id').limit(1)
  return !error && (data?.length ?? 0) > 0
}
