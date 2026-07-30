import TCGdex, { Query } from '@tcgdex/sdk'
import type { CardLang, CardPrice } from '../types'

const clients = new Map<CardLang, TCGdex>()

export type CardBrief = {
  id: string
  name: string
  localId: string | number
  image?: string
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

export async function searchCards(lang: CardLang, name: string, page = 1) {
  const q = name.trim()
  if (!q) return []
  return getClient(lang).card.list(Query.create().like('name', q).paginate(page, 30))
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
  let q = Query.create().paginate(page, pageSize)

  const name = filters.name?.trim()
  if (name) q = q.like('name', name)

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
    return list.map((c) => ({
      id: c.id,
      name: c.name,
      localId: c.localId,
      image: c.image,
    }))
  } catch {
    if (name) {
      return (await searchCards(lang, name, page)) as DeckSearchHit[]
    }
    // Last resort: unfiltered page
    try {
      const list = (await getClient(lang).card.list(
        Query.create().paginate(page, pageSize),
      )) as CardBrief[]
      return list.map((c) => ({
        id: c.id,
        name: c.name,
        localId: c.localId,
        image: c.image,
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
