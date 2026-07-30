import TCGdex, { Query } from '@tcgdex/sdk'
import type { CardLang, CardPrice } from '../types'

const clients = new Map<CardLang, TCGdex>()

export type CardBrief = {
  id: string
  name: string
  localId: string | number
  image?: string
  setId?: string
}

export type CardVariantEntry = {
  key: string
  cardId: string
  name: string
  localId: string
  image?: string
  setName?: string
  setId?: string
  variant: string
  variantLabel: string
  price: CardPrice
}

const VARIANT_LABELS: Record<string, string> = {
  normal: 'Normal',
  reverse: 'Reverse Holo',
  holo: 'Holo',
  holofoil: 'Holofoil',
  firstEdition: '1ª Edição',
  'first-edition': '1ª Edição',
  wPromo: 'Promo',
  unlimited: 'Unlimited',
}

export function getClient(lang: CardLang): TCGdex {
  let client = clients.get(lang)
  if (!client) {
    client = new TCGdex(lang)
    clients.set(lang, client)
  }
  return client
}

export function cardImageUrl(
  imageBase: string | undefined,
  quality: 'high' | 'low' = 'low',
): string | undefined {
  if (!imageBase) return undefined
  if (/\.(webp|png|jpg|jpeg)$/i.test(imageBase)) return imageBase
  return `${imageBase}/${quality}.webp`
}

/** Ordered image candidates (locale → English fallback). */
export function cardImageCandidates(
  imageBase: string | undefined,
  quality: 'high' | 'low' = 'low',
): string[] {
  if (!imageBase) return []
  const primary = cardImageUrl(imageBase, quality)
  if (!primary) return []
  const out = [primary]
  const enBase = imageBase.replace(/\/(pt|ja)\//i, '/en/')
  if (enBase !== imageBase) {
    const en = cardImageUrl(enBase, quality)
    if (en && !out.includes(en)) out.push(en)
  }
  const otherQuality = quality === 'low' ? 'high' : 'low'
  const enOther = cardImageUrl(
    enBase !== imageBase ? enBase : imageBase.replace(/\/(pt|ja)\//i, '/en/'),
    otherQuality,
  )
  if (enOther && !out.includes(enOther)) out.push(enOther)
  return out
}

/** Scarlet & Violet Energy (sve) basic prints — reliable art for nameless TCGdex energies. */
const BASIC_ENERGY_SVE_INDEX: Record<string, number> = {
  grass: 1,
  planta: 1,
  grama: 1,
  fire: 2,
  fogo: 2,
  water: 3,
  água: 3,
  agua: 3,
  lightning: 4,
  elétrico: 4,
  eletrico: 4,
  raios: 4,
  psychic: 5,
  psíquico: 5,
  psichico: 5,
  fighting: 6,
  lutador: 6,
  lutadora: 6,
  darkness: 7,
  sombrio: 7,
  sombria: 7,
  metal: 8,
  metálica: 8,
  metalica: 8,
  fairy: 9,
  fada: 9,
  colorless: 10,
  incolor: 10,
}

function detectBasicEnergyTypeKey(name?: string, energyType?: string): string | null {
  const blob = `${name ?? ''} ${energyType ?? ''}`.toLowerCase()
  // Prefer longer keys first (e.g. lightning before nothing)
  const keys = Object.keys(BASIC_ENERGY_SVE_INDEX).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (blob.includes(key)) return key
  }
  return null
}

/**
 * Extra image URLs when TCGdex has no `image` (very common for basic Energy).
 * Uses PokémonTCG.io set prints + sve basic-energy stand-ins.
 */
export function inferMissingImageCandidates(opts: {
  cardId: string
  name?: string
  localId?: string | number
  energyType?: string
}): string[] {
  const urls: string[] = []
  const id = baseCardId(opts.cardId)
  const dash = id.indexOf('-')
  if (dash > 0) {
    const setId = id.slice(0, dash)
    const raw = String(opts.localId ?? id.slice(dash + 1))
    const stripped = raw.replace(/^0+/, '') || '0'
    for (const n of [...new Set([stripped, raw])]) {
      urls.push(`https://images.pokemontcg.io/${setId}/${n}.png`)
      urls.push(`https://images.pokemontcg.io/${setId}/${n}_hires.png`)
    }
  }

  const typeKey = detectBasicEnergyTypeKey(opts.name, opts.energyType)
  if (typeKey) {
    const n = BASIC_ENERGY_SVE_INDEX[typeKey]
    if (n) {
      urls.push(`https://images.pokemontcg.io/sve/${n}.png`)
      urls.push(`https://images.pokemontcg.io/sve/${n}_hires.png`)
    }
  }

  return urls
}

export function baseCardId(idOrKey: string): string {
  const i = idOrKey.indexOf('::')
  return i === -1 ? idOrKey : idOrKey.slice(0, i)
}

/** Parse keys like `cardId::pt::reverse` or legacy `cardId::reverse`. */
export function parseOwnedKey(key: string): {
  cardId: string
  lang?: CardLang
  variantParts: string[]
} {
  const parts = key.split('::')
  const cardId = parts[0] ?? key
  if (parts.length >= 2 && (parts[1] === 'pt' || parts[1] === 'en' || parts[1] === 'ja')) {
    return { cardId, lang: parts[1], variantParts: parts.slice(2) }
  }
  return { cardId, variantParts: parts.slice(1) }
}

type PricingBlock = {
  cardmarket?: { avg?: number | null; trend?: number | null; low?: number | null }
  tcgplayer?: Record<string, { marketPrice?: number | null } | null> | null
}

export function extractPrice(card: { pricing?: PricingBlock }): CardPrice {
  const cm = card.pricing?.cardmarket
  const tp = card.pricing?.tcgplayer
  let usd: number | null = null
  if (tp && typeof tp === 'object') {
    for (const key of ['normal', 'holofoil', 'reverse-holofoil', '1st-edition-holofoil']) {
      const p = tp[key]
      if (p?.marketPrice != null) {
        usd = p.marketPrice
        break
      }
    }
  }
  const eur = cm?.avg ?? cm?.trend ?? cm?.low ?? null
  return { eur, usd, updated: Date.now() }
}

export function variantLabel(type: string, extras: string[] = []): string {
  const base = VARIANT_LABELS[type] ?? type.replace(/-/g, ' ')
  if (extras.length === 0) return base
  return `${base} · ${extras.join(' · ')}`
}

export function isSpeciesCardName(cardName: string, speciesName: string): boolean {
  const n = cardName.toLowerCase().trim()
  const s = speciesName.toLowerCase().trim()
  if (n === s) return true
  if (n.startsWith(`${s} `)) return true
  if (n.endsWith(` ${s}`)) return true
  if (n.includes(`'s ${s}`)) return true
  return false
}

export async function fetchSets(lang: CardLang) {
  const sets = await getClient(lang).set.list()
  return [...sets].sort((a, b) =>
    a.name.localeCompare(b.name, lang === 'ja' ? 'ja' : 'pt-BR'),
  )
}

function localIdVariants(localId: string): string[] {
  const raw = localId.trim()
  const digits = raw.replace(/\D/g, '')
  const suffix = raw.replace(/[\d#\s]/g, '')
  const n = String(Number(digits || raw))
  if (!n || n === 'NaN') return [raw]
  return [
    ...new Set([
      raw,
      n + suffix,
      n.padStart(2, '0') + suffix,
      n.padStart(3, '0') + suffix,
    ]),
  ]
}

function localIdMatches(cardLocalId: string | number, queryLocalId: string): boolean {
  const card = String(cardLocalId)
  const qDigits = queryLocalId.replace(/\D/g, '')
  const cDigits = card.replace(/\D/g, '')
  const qSuffix = queryLocalId.replace(/[\d#\s]/g, '').toLowerCase()
  const cSuffix = card.replace(/[\d#\s]/g, '').toLowerCase()
  if (qSuffix !== cSuffix) return false
  if (!qDigits || !cDigits) return card.toLowerCase() === queryLocalId.toLowerCase()
  if (String(Number(cDigits)) !== String(Number(qDigits))) return false
  // "009" must not match old "9" — keep zero-padding / width when the user typed it
  if (qDigits.length >= 3 || /^0/.test(qDigits)) {
    const padded = String(Number(qDigits)).padStart(qDigits.length, '0')
    return cDigits === qDigits || cDigits === padded
  }
  return true
}

async function resolveSetsByOfficial(official: number): Promise<string[]> {
  try {
    const res = await fetch('/scan/set-index.json')
    if (res.ok) {
      const idx = (await res.json()) as { byOfficial?: Record<string, string[]> }
      const fromIndex = idx.byOfficial?.[String(official)]
      if (fromIndex?.length) return fromIndex
    }
  } catch {
    /* fall through */
  }

  try {
    const sets = await getClient('en').set.list()
    return sets
      .filter((s) => {
        const count = (s as { cardCount?: { official?: number; total?: number } }).cardCount
        return count?.official === official || count?.total === official
      })
      .map((s) => s.id)
  } catch {
    return []
  }
}

async function fetchCardBrief(
  lang: CardLang,
  setId: string,
  localId: string,
): Promise<CardBrief | null> {
  const langs: CardLang[] = lang === 'en' ? ['en'] : [lang, 'en']
  for (const lid of localIdVariants(localId)) {
    for (const L of langs) {
      try {
        const card = await getClient(L).card.get(`${setId}-${lid}`)
        if (!card?.id) continue
        return {
          id: card.id,
          name: card.name,
          localId: card.localId,
          image: card.image,
        }
      } catch {
        /* try next */
      }
    }
  }
  return null
}

async function listByName(lang: CardLang, name: string, page = 1, pageSize = 30): Promise<CardBrief[]> {
  try {
    const list = await getClient(lang).card.list(
      Query.create().like('name', name).paginate(page, pageSize),
    )
    return list as CardBrief[]
  } catch {
    return []
  }
}

async function listByLocalId(lang: CardLang, localId: string): Promise<CardBrief[]> {
  const variants = localIdVariants(localId)
  const byId = new Map<string, CardBrief>()
  await Promise.all(
    variants.map(async (lid) => {
      try {
        const list = (await getClient(lang).card.list(
          Query.create().like('localId', lid).paginate(1, 100),
        )) as CardBrief[]
        for (const c of list) {
          if (localIdMatches(c.localId, localId) && !byId.has(c.id)) byId.set(c.id, c)
        }
      } catch {
        /* ignore */
      }
    }),
  )
  return [...byId.values()]
}

function setIdFromCardId(cardId: string): string {
  const dash = cardId.lastIndexOf('-')
  return dash > 0 ? cardId.slice(0, dash) : cardId
}

function withSetId(brief: CardBrief): CardBrief {
  return { ...brief, setId: brief.setId ?? setIdFromCardId(brief.id) }
}

/** Prefer locale metadata; fall back to EN / original brief. */
async function localizeBriefs(lang: CardLang, briefs: CardBrief[], limit = 40): Promise<CardBrief[]> {
  const sliced = briefs.slice(0, limit)
  if (lang === 'en') return sliced.map(withSetId)

  const localized = await Promise.all(
    sliced.map(async (b) => {
      const setId = setIdFromCardId(b.id)
      const localId = String(b.localId)
      const hit = await fetchCardBrief(lang, setId, localId)
      return withSetId(hit ?? b)
    }),
  )
  return localized
}

function scoreBrief(c: CardBrief, numOnly: string | null, preferredSets: Set<string> | null): number {
  let score = 0
  if (preferredSets?.has(setIdFromCardId(c.id))) score += 100
  if (numOnly) {
    const lid = String(c.localId)
    if (lid === numOnly) score += 20
    else if (lid === String(Number(numOnly.replace(/\D/g, ''))).padStart(numOnly.replace(/\D/g, '').length, '0'))
      score += 10
  }
  if (c.image) score += 2
  return score
}

export async function searchCards(lang: CardLang, name: string, page = 1): Promise<CardBrief[]> {
  const q = name.trim()
  if (!q) return []

  const byId = new Map<string, CardBrief>()

  function merge(list: CardBrief[]) {
    for (const c of list) {
      if (!byId.has(c.id)) byId.set(c.id, c)
    }
  }

  const stripped = q.replace(/^#/, '').trim()
  const frac = /^(\d+[a-zA-Z]?)\s*\/\s*(\d+)$/i.exec(stripped)
  const localFromFrac = frac?.[1] ?? null
  const setTotal = frac?.[2] ? Number(frac[2]) : null
  const numOnly =
    localFromFrac ?? (/^\d+[a-zA-Z]?$/i.test(stripped) ? stripped : null)
  const cardIdMatch = /^([a-z0-9.]+)-(\d+[a-zA-Z]?)$/i.exec(stripped.replace(/\s+/g, ''))
  const isNumberQuery = Boolean(numOnly || cardIdMatch)

  const tasks: Promise<void>[] = []

  // Name: locale catalog + EN discovery (JA has Japanese names; Latin names live in EN)
  if (!isNumberQuery) {
    tasks.push(listByName(lang, q, page, 30).then(merge))
    if (lang !== 'en') {
      tasks.push(listByName('en', q, page, 30).then(merge))
    }
  }

  // "009/094" → sets with official/total 94, then fetch set-009
  let preferredSets: Set<string> | null = null
  if (numOnly && setTotal && Number.isFinite(setTotal)) {
    tasks.push(
      (async () => {
        const setIds = await resolveSetsByOfficial(setTotal)
        preferredSets = new Set(setIds)
        const cards = await Promise.all(
          setIds.slice(0, 16).map((setId) => fetchCardBrief(lang, setId, numOnly)),
        )
        merge(cards.filter((c): c is CardBrief => Boolean(c)))
      })(),
    )
  }

  // Number search (TCGdex equal('localId') returns []; use like + filter)
  // Prefer EN catalog for coverage, also search active locale.
  if (numOnly && !(setTotal && Number.isFinite(setTotal))) {
    tasks.push(listByLocalId('en', numOnly).then(merge))
    if (lang !== 'en') {
      tasks.push(listByLocalId(lang, numOnly).then(merge))
    }
  } else if (numOnly && setTotal && Number.isFinite(setTotal)) {
    // Still gather extras, but preferredSets filter applies later
    tasks.push(listByLocalId('en', numOnly).then(merge))
  }

  // Full id: "sv3-25" / "me02-009"
  if (cardIdMatch) {
    const setId = cardIdMatch[1].toLowerCase()
    const lid = cardIdMatch[2]
    tasks.push(
      fetchCardBrief(lang, setId, lid).then((card) => {
        if (card) merge([card])
      }),
    )
  }

  await Promise.all(tasks)

  let all = [...byId.values()]

  if (numOnly && setTotal && Number.isFinite(setTotal)) {
    if (!preferredSets) preferredSets = new Set(await resolveSetsByOfficial(setTotal))
    const preferred = all.filter((c) => preferredSets!.has(setIdFromCardId(c.id)))
    if (preferred.length > 0) all = preferred
  }

  all.sort(
    (a, b) =>
      scoreBrief(b, numOnly, preferredSets) - scoreBrief(a, numOnly, preferredSets),
  )

  return localizeBriefs(lang, all, 40)
}

export type CardSearchFilters = {
  name?: string
  category?: 'Pokemon' | 'Trainer' | 'Energy' | ''
  /** Canonical English type key e.g. Fire, Water */
  type?: string
  page?: number
  pageSize?: number
}

export type DeckSearchHit = CardBrief & {
  category?: string
  types?: string[]
  stage?: string
  rarity?: string
  setName?: string
  setId?: string
  trainerType?: string
  energyType?: string
  regulationMark?: string
  hp?: number
}

/** API category values differ by language (PT uses Pokémon / Treinador / Energia). */
const CATEGORY_BY_LANG: Record<CardLang, Record<'Pokemon' | 'Trainer' | 'Energy', string>> = {
  en: { Pokemon: 'Pokemon', Trainer: 'Trainer', Energy: 'Energy' },
  ja: { Pokemon: 'Pokemon', Trainer: 'Trainer', Energy: 'Energy' },
  pt: { Pokemon: 'Pokémon', Trainer: 'Treinador', Energy: 'Energia' },
}

/** API type values differ by language (PT uses Fogo, Água…). */
const TYPE_BY_LANG: Record<CardLang, Record<string, string>> = {
  en: {
    Grass: 'Grass',
    Fire: 'Fire',
    Water: 'Water',
    Lightning: 'Lightning',
    Psychic: 'Psychic',
    Fighting: 'Fighting',
    Darkness: 'Darkness',
    Metal: 'Metal',
    Fairy: 'Fairy',
    Dragon: 'Dragon',
    Colorless: 'Colorless',
  },
  ja: {
    Grass: 'Grass',
    Fire: 'Fire',
    Water: 'Water',
    Lightning: 'Lightning',
    Psychic: 'Psychic',
    Fighting: 'Fighting',
    Darkness: 'Darkness',
    Metal: 'Metal',
    Fairy: 'Fairy',
    Dragon: 'Dragon',
    Colorless: 'Colorless',
  },
  pt: {
    Grass: 'Planta',
    Fire: 'Fogo',
    Water: 'Água',
    Lightning: 'Elétrico',
    Psychic: 'Psíquico',
    Fighting: 'Lutador',
    Darkness: 'Sombrio',
    Metal: 'Metal',
    Fairy: 'Fada',
    Dragon: 'Dragão',
    Colorless: 'Incolor',
  },
}

export async function searchCardsAdvanced(
  lang: CardLang,
  filters: CardSearchFilters,
): Promise<DeckSearchHit[]> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 48
  const name = filters.name?.trim()

  // Name path: reuse discovery EN + locale localization from searchCards
  if (name) {
    const discovered = await searchCards(lang, name, page)
    let hits: DeckSearchHit[] = discovered.map((c) => ({
      id: c.id,
      name: c.name,
      localId: c.localId,
      image: c.image,
      setId: c.setId ?? setIdFromCardId(c.id),
    }))

    // Category / type filters — apply via API on EN (stable), then keep matching ids
    if (filters.category || filters.type) {
      const filterLang: CardLang = lang === 'pt' ? 'pt' : 'en'
      let q = Query.create().paginate(1, 100)
      if (filters.category) {
        const cat =
          CATEGORY_BY_LANG[filterLang][filters.category] ?? filters.category
        q = q.equal('category', cat)
      }
      if (filters.type) {
        const typeName = TYPE_BY_LANG[filterLang][filters.type] ?? filters.type
        q = q.contains('types', typeName)
      }
      // Narrow by name on the filter language too
      q = q.like('name', name)
      try {
        const filtered = (await getClient(filterLang).card.list(q)) as CardBrief[]
        const allowed = new Set(filtered.map((c) => c.id))
        // Also allow EN-discovered ids that appear in filtered list when langs differ
        if (allowed.size > 0) {
          hits = hits.filter((h) => allowed.has(h.id))
        }
      } catch {
        /* keep unfiltered name hits */
      }
    }

    return hits.slice(0, pageSize)
  }

  // Category / type only (no name)
  let q = Query.create().paginate(page, pageSize)
  if (filters.category) {
    const cat = CATEGORY_BY_LANG[lang][filters.category] ?? filters.category
    q = q.equal('category', cat)
  }
  if (filters.type) {
    const typeName = TYPE_BY_LANG[lang][filters.type] ?? filters.type
    q = q.contains('types', typeName)
  }

  try {
    const list = (await getClient(lang).card.list(q)) as CardBrief[]
    const briefs = list.map(withSetId)
    const localized = await localizeBriefs(lang, briefs, pageSize)
    return localized.map((c) => ({
      id: c.id,
      name: c.name,
      localId: c.localId,
      image: c.image,
      setId: c.setId,
    }))
  } catch {
    try {
      const list = (await getClient('en').card.list(
        Query.create().paginate(page, pageSize),
      )) as CardBrief[]
      const localized = await localizeBriefs(lang, list.map(withSetId), pageSize)
      return localized.map((c) => ({
        id: c.id,
        name: c.name,
        localId: c.localId,
        image: c.image,
        setId: c.setId,
      }))
    } catch {
      return []
    }
  }
}

export type DeckCardMeta = {
  cardId: string
  name: string
  category: 'Pokemon' | 'Trainer' | 'Energy'
  types?: string[]
  stage?: string
  rarity?: string
  setId?: string
  setName?: string
  localId: string
  image?: string
  regulationMark?: string
  trainerType?: string
  energyType?: string
  effect?: string
  isBasicEnergy: boolean
  isAceSpec: boolean
  isRadiant: boolean
}

export async function fetchDeckCardMeta(
  lang: CardLang,
  cardId: string,
): Promise<DeckCardMeta | null> {
  try {
    const card = (await getCard(lang, cardId)) as FullCardLike & {
      category?: string
      stage?: string
      rarity?: string
      types?: string[]
      trainerType?: string
      energyType?: string
      regulationMark?: string
      effect?: string
      hp?: number
    } | null
    if (!card) return null
    const rawCat = String(card.category ?? '')
    const category =
      rawCat === 'Trainer' || rawCat === 'Treinador'
        ? 'Trainer'
        : rawCat === 'Energy' || rawCat === 'Energia'
          ? 'Energy'
          : 'Pokemon'
    const name = card.name
    const rarity = card.rarity
    const effect = card.effect
    const energyType = card.energyType
    const isBasicEnergy =
      category === 'Energy' &&
      (energyType?.toLowerCase() === 'normal' ||
        ((!energyType || !/special/i.test(energyType)) &&
          (!effect || effect.trim().length <= 40) &&
          /energy|energia/i.test(name)))
    const isAceSpec = /ace\s*spec/i.test(`${rarity ?? ''} ${effect ?? ''}`)
    const isRadiant = /^(radiant|radiante)\b/i.test(name.trim())

    let image = cardImageUrl(card.image, 'high')
    if (!image) {
      image = inferMissingImageCandidates({
        cardId: card.id,
        name,
        localId: card.localId,
        energyType,
      })[0]
    }

    return {
      cardId: card.id,
      name,
      category,
      types: card.types,
      stage: card.stage,
      rarity,
      setId: card.set?.id,
      setName: card.set?.name,
      localId: String(card.localId),
      image,
      regulationMark: card.regulationMark,
      trainerType: card.trainerType,
      energyType,
      effect,
      isBasicEnergy: Boolean(isBasicEnergy),
      isAceSpec,
      isRadiant,
    }
  } catch {
    return null
  }
}

export async function getCard(lang: CardLang, id: string) {
  const cardId = baseCardId(id)
  try {
    const card = await getClient(lang).card.get(cardId)
    if (card) return card
  } catch {
    // missing in this locale
  }
  if (lang !== 'en') {
    try {
      const fallback = await getClient('en').card.get(cardId)
      if (fallback) return fallback
    } catch {
      // ignore
    }
  }
  return undefined
}

async function listAllByName(lang: CardLang, name: string): Promise<CardBrief[]> {
  const sdk = getClient(lang)
  const all: CardBrief[] = []
  for (let page = 1; page <= 25; page++) {
    const batch = (await sdk.card.list(
      Query.create().like('name', name).paginate(page, 100),
    )) as CardBrief[]
    if (!batch.length) break
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

type FullCardLike = {
  id: string
  name: string
  localId: string | number
  image?: string
  set?: { id?: string; name?: string }
  dexId?: number[]
  variants?: Record<string, boolean | undefined>
  variants_detailed?: Array<{
    type: string
    stamp?: string[]
    foil?: string
    pricing?: PricingBlock
  }>
  pricing?: PricingBlock
}

function expandCardVariants(card: FullCardLike): CardVariantEntry[] {
  const image = cardImageUrl(card.image, 'high')
  const localId = String(card.localId)
  const setName = card.set?.name
  const setId = card.set?.id
  const detailed = card.variants_detailed

  if (detailed && detailed.length > 0) {
    return detailed.map((v) => {
      const extras = [...(v.stamp ?? []), ...(v.foil ? [v.foil] : [])]
      const keyParts = [card.id, v.type, ...extras].filter(Boolean)
      return {
        key: keyParts.join('::'),
        cardId: card.id,
        name: card.name,
        localId,
        image,
        setName,
        setId,
        variant: v.type,
        variantLabel: variantLabel(v.type, extras),
        price: extractPrice({ pricing: v.pricing }),
      }
    })
  }

  const flags = card.variants
  if (flags) {
    const entries: CardVariantEntry[] = []
    for (const [type, on] of Object.entries(flags)) {
      if (!on) continue
      entries.push({
        key: `${card.id}::${type}`,
        cardId: card.id,
        name: card.name,
        localId,
        image,
        setName,
        setId,
        variant: type,
        variantLabel: variantLabel(type),
        price: extractPrice(card),
      })
    }
    if (entries.length) return entries
  }

  return [
    {
      key: `${card.id}::normal`,
      cardId: card.id,
      name: card.name,
      localId,
      image,
      setName,
      setId,
      variant: 'normal',
      variantLabel: 'Normal',
      price: extractPrice(card),
    },
  ]
}

/**
 * Discover printings via English catalog (stable names), then load
 * details/images in the requested nationality (pt/en/ja).
 */
export async function fetchSpeciesVariants(
  lang: CardLang,
  dexId: number,
  speciesName: string,
): Promise<CardVariantEntry[]> {
  const briefs = await listAllByName('en', speciesName)
  const candidates = briefs.filter((c) => isSpeciesCardName(c.name, speciesName))

  try {
    const exact = (await getClient('en').card.list(
      Query.create().equal('name', speciesName).paginate(1, 100),
    )) as CardBrief[]
    for (const c of exact) {
      if (!candidates.some((x) => x.id === c.id)) candidates.push(c)
    }
  } catch {
    // ignore
  }

  const variants: CardVariantEntry[] = []
  const concurrency = 6
  for (let i = 0; i < candidates.length; i += concurrency) {
    const chunk = candidates.slice(i, i + concurrency)
    const details = await Promise.all(
      chunk.map(async (b) => {
        try {
          const localized = (await getClient(lang).card.get(b.id)) as FullCardLike | null
          if (localized && (localized.image || localized.name)) return localized
          if (lang !== 'en') {
            return (await getClient('en').card.get(b.id)) as FullCardLike | null
          }
          return localized
        } catch {
          if (lang !== 'en') {
            try {
              return (await getClient('en').card.get(b.id)) as FullCardLike | null
            } catch {
              return null
            }
          }
          return null
        }
      }),
    )
    for (const card of details) {
      if (!card) continue
      if (card.dexId?.length && !card.dexId.includes(dexId)) continue

      const expanded = expandCardVariants(card).map((v) => {
        const rest = v.key.split('::').slice(1)
        return {
          ...v,
          key: [v.cardId, lang, ...rest].join('::'),
        }
      })
      variants.push(...expanded)
    }
  }

  variants.sort((a, b) => {
    const sa = a.setName ?? ''
    const sb = b.setName ?? ''
    if (sa !== sb) return sa.localeCompare(sb, 'pt-BR')
    const na = Number.parseInt(a.localId, 10)
    const nb = Number.parseInt(b.localId, 10)
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
    if (a.localId !== b.localId) return a.localId.localeCompare(b.localId)
    return a.variantLabel.localeCompare(b.variantLabel, 'pt-BR')
  })

  return variants
}
