import type { CardLang } from '../../types'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { catalogCardIdCandidates, baseCardId, normalizeCatalogSetId } from '../cardKeys'
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
  sets?: { source_id: string; name: string; en_name: string | null; pt_name: string | null; serie_slug: string | null } | null
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
  if (!supabase || !cardIds.length) return new Map<string, { name: string }>()
  const dbLang = langToDb(lang)
  const { data: cards } = await supabase.from('cards').select('id, canonical_id').in('canonical_id', cardIds)
  const idByCanonical = new Map((cards ?? []).map((c) => [c.canonical_id, c.id]))
  const uuids = [...idByCanonical.values()]
  if (!uuids.length) return new Map()
  const { data: trs } = await supabase
    .from('card_translations')
    .select('card_id, name')
    .in('card_id', uuids)
    .eq('language', dbLang)
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
  sets (source_id, name, en_name, pt_name, serie_slug)
`

export const supabaseCardProvider: CardProvider = {
  async getById(lang, id) {
    if (!supabase) return null
    const preferredId = baseCardId(id).toLowerCase()
    for (const cid of catalogCardIdCandidates(id)) {
      const { data, error } = await supabase
        .from('cards')
        .select(CARD_SELECT)
        .eq('canonical_id', cid)
        .maybeSingle()
      if (error || !data) continue
      const trs = await fetchTranslation([data.canonical_id], lang)
      const card = mapCard(asDbCard(data), lang, trs.get(data.canonical_id))
      return preferredId !== data.canonical_id ? { ...card, id: preferredId } : card
    }
    return null
  },

  async search(lang, query, page = 1) {
    if (!supabase) return []
    const q = query.trim()
    if (!q) return []

    const pageSize = 40
    const from = (page - 1) * pageSize
    const cardIdMatch = /^([a-z0-9.]+)-(\d+[a-zA-Z]?)$/i.exec(q.replace(/\s+/g, ''))

    if (cardIdMatch) {
      const rawId = q.replace(/\s+/g, '').toLowerCase()
      for (const cid of catalogCardIdCandidates(rawId)) {
        const { data } = await supabase
          .from('cards')
          .select(CARD_SELECT)
          .eq('canonical_id', cid)
          .limit(1)
        if (data?.length) {
          const trs = await fetchTranslation([data[0].canonical_id], lang)
          const brief = mapBrief(asDbCard(data[0]), lang, trs.get(data[0].canonical_id))
          return [{ ...brief, id: rawId !== data[0].canonical_id ? rawId : brief.id }]
        }
      }
    }

    const numOnly = /^\d+[a-zA-Z]?$/.test(q.replace(/^#/, '')) ? q.replace(/^#/, '') : null

    let builder = supabase.from('cards').select(CARD_SELECT)

    if (numOnly) {
      builder = builder.or(`number.eq.${numOnly},canonical_id.ilike.%-${numOnly}`)
    } else {
      builder = builder.or(`name.ilike.%${q}%,canonical_id.ilike.%${q}%`)
    }

    const { data, error } = await builder.range(from, from + pageSize - 1)
    if (error || !data?.length) {
      const dbLang = langToDb(lang)
      const { data: trRows } = await supabase
        .from('card_translations')
        .select('name, cards!inner(canonical_id, number, image_low_url, image_high_url, image_url, sets(source_id))')
        .eq('language', dbLang)
        .ilike('name', `%${q}%`)
        .limit(pageSize)
      if (!trRows?.length) return []
      return trRows.map((row) => {
        const c = row.cards as unknown as DbCard
        return mapBrief(c, lang, { name: row.name })
      })
    }

    const ids = data.map((d) => d.canonical_id)
    const trs = await fetchTranslation(ids, lang)
    return data.map((d) => mapBrief(asDbCard(d), lang, trs.get(d.canonical_id)))
  },

  async searchAdvanced(lang, filters) {
    if (!supabase) return []
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 48
    const from = (page - 1) * pageSize

    let builder = supabase.from('cards').select(CARD_SELECT)
    if (filters.name?.trim()) {
      builder = builder.ilike('name', `%${filters.name.trim()}%`)
    }
    if (filters.category) {
      const catMap: Record<string, string> = {
        Pokemon: 'Pokémon',
        Trainer: 'Treinador',
        Energy: 'Energia',
      }
      const cat = lang === 'pt' ? (catMap[filters.category] ?? filters.category) : filters.category
      builder = builder.eq('category', cat)
    }
    if (filters.type) {
      builder = builder.contains('types', [filters.type])
    }

    const { data } = await builder.range(from, from + pageSize - 1)
    if (!data?.length) return []

    const trs = await fetchTranslation(
      data.map((d) => d.canonical_id),
      lang,
    )
    return data.map((d) => {
      const row = asDbCard(d)
      const brief = mapBrief(row, lang, trs.get(row.canonical_id))
      return {
        ...brief,
        category: row.category ?? undefined,
        types: row.types ?? undefined,
        stage: row.stage ?? undefined,
        rarity: row.rarity ?? undefined,
        setName: row.sets?.name,
        setId: row.sets?.source_id,
        trainerType: row.trainer_type ?? undefined,
        energyType: row.energy_type ?? undefined,
        regulationMark: row.regulation_mark ?? undefined,
        hp: row.hp ?? undefined,
      } satisfies DeckSearchHit
    })
  },

  async listSets(lang) {
    if (!supabase) return []
    const { data } = await supabase
      .from('sets')
      .select('source_id, name, pt_name, en_name')
      .order('release_date', { ascending: false, nullsFirst: false })
    return (data ?? []).map((s) => ({
      id: s.source_id,
      name: lang === 'pt' ? (s.pt_name ?? s.name) : (s.en_name ?? s.name),
    }))
  },

  async getSet(lang, setId) {
    if (!supabase) return null
    const candidates = [...new Set([setId, normalizeCatalogSetId(setId)].map((s) => s.toLowerCase()))]
    let data: Record<string, unknown> | null = null
    for (const sid of candidates) {
      const { data: row } = await supabase.from('sets').select('*').eq('source_id', sid).maybeSingle()
      if (row) {
        data = row
        break
      }
    }
    if (!data) return null
    return {
      id: data.source_id,
      name: lang === 'pt' ? (data.pt_name ?? data.name) : (data.en_name ?? data.name),
      logo: data.logo_url ?? undefined,
      symbol: data.symbol_url ?? undefined,
      cardCount: data.total_cards ?? 0,
      cardCountOfficial: data.official_total ?? undefined,
      releaseDate: data.release_date ?? undefined,
      serieName: data.serie_slug ?? undefined,
      serieId: data.serie_slug ?? undefined,
    } satisfies SetMeta
  },

  async listSetCards(lang, setId) {
    if (!supabase) return []
    const sid = normalizeCatalogSetId(setId)
    const { data: setRow } = await supabase
      .from('sets')
      .select('id')
      .in('source_id', [...new Set([setId, sid])])
      .maybeSingle()
    if (!setRow) return []

    const { data } = await supabase
      .from('cards')
      .select('canonical_id, name, number, image_low_url, image_high_url, image_url')
      .eq('set_id', setRow.id)
      .order('number')

    const ids = (data ?? []).map((c) => c.canonical_id)
    const trs = await fetchTranslation(ids, lang)

    return (data ?? []).map(
      (c): SetCardBrief => ({
        id: c.canonical_id,
        name: trs.get(c.canonical_id)?.name ?? c.name,
        localId: c.number ?? '',
        image: c.image_low_url ?? c.image_high_url ?? c.image_url ?? undefined,
        setId,
      }),
    )
  },

  async fetchSpeciesVariants(lang, dexId, speciesName) {
    if (!supabase) return []
    const { data: cards } = await supabase
      .from('cards')
      .select(CARD_SELECT)
      .contains('national_pokedex_numbers', [dexId])
      .limit(80)

    if (!cards?.length) {
      const { data: byName } = await supabase
        .from('cards')
        .select(CARD_SELECT)
        .ilike('name', `%${speciesName.split(' ')[0]}%`)
        .limit(40)
      if (!byName?.length) return []
      return mapVariants(byName.map(asDbCard), lang)
    }
    return mapVariants(cards.map(asDbCard), lang)
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

async function mapVariants(cards: DbCard[], lang: CardLang): Promise<CardVariant[]> {
  if (!supabase || !cards.length) return []
  const ids = cards.map((c) => c.canonical_id)
  const trs = await fetchTranslation(ids, lang)

  const { data: cardRows } = await supabase.from('cards').select('id, canonical_id').in('canonical_id', ids)
  const uuidByCanonical = new Map((cardRows ?? []).map((c) => [c.canonical_id, c.id]))
  const uuids = [...uuidByCanonical.values()]
  const { data: allVariants } = uuids.length
    ? await supabase.from('card_variants').select('card_id, variant_type').in('card_id', uuids)
    : { data: [] }

  const variantsByCard = new Map<string, string[]>()
  for (const v of allVariants ?? []) {
    const canonical = [...uuidByCanonical.entries()].find(([, u]) => u === v.card_id)?.[0]
    if (!canonical) continue
    const list = variantsByCard.get(canonical) ?? []
    list.push(v.variant_type)
    variantsByCard.set(canonical, list)
  }

  const out: CardVariant[] = []
  for (const c of cards) {
    const types = variantsByCard.get(c.canonical_id)?.length
      ? variantsByCard.get(c.canonical_id)!
      : ['normal']
    for (const vt of types) {
      out.push({
        key: `${c.canonical_id}::${vt}`,
        cardId: c.canonical_id,
        name: trs.get(c.canonical_id)?.name ?? c.name,
        localId: c.number ?? '',
        image: c.image_low_url ?? c.image_high_url ?? undefined,
        setName: c.sets?.name,
        setId: c.sets?.source_id,
        variant: vt,
        variantLabel: vt,
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
