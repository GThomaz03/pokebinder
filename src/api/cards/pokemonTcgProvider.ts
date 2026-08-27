import type { CardLang, CardPrice } from '../../types'
import { API_CONFIG } from '../config'
import { resolveDexId, resolvePokemonSearchTerms } from '../../lib/pokemonNameAliases'
import { fetchJson, CatalogError } from './http'
import type { CardBrief, CardVariant, NormalizedCard } from './types'

type PokemonTcgImages = {
  small?: string
  large?: string
}

type PokemonTcgSet = {
  id?: string
  name?: string
}

type PokemonTcgPricePoint = {
  low?: number | null
  mid?: number | null
  market?: number | null
}

type PokemonTcgCard = {
  id: string
  name: string
  number?: string
  images?: PokemonTcgImages
  set?: PokemonTcgSet
  artist?: string
  rarity?: string
  types?: string[]
  nationalPokedexNumbers?: number[]
  subtypes?: string[]
  supertype?: string
  hp?: string
  regulationMark?: string
  rules?: string[]
  tcgplayer?: { prices?: Record<string, PokemonTcgPricePoint | undefined> }
  cardmarket?: {
    prices?: { averageSellPrice?: number | null; trendPrice?: number | null }
  }
}

type PokemonTcgListResponse = {
  data: PokemonTcgCard[]
  page?: number
  pageSize?: number
  count?: number
  totalCount?: number
}

type PokemonTcgCardResponse = {
  data: PokemonTcgCard
}

const VARIANT_FROM_TCGPLAYER: Record<string, { variant: string; label: string }> = {
  normal: { variant: 'normal', label: 'Normal' },
  holofoil: { variant: 'holo', label: 'Holo' },
  reverseHolofoil: { variant: 'reverse', label: 'Reverse Holo' },
  '1stEdition': { variant: 'firstEdition', label: '1ª Edição' },
  '1stEditionHolofoil': { variant: 'firstEdition', label: '1ª Edição Holo' },
  unlimitedHolofoil: { variant: 'unlimited', label: 'Unlimited' },
}

function mapSupertype(supertype?: string): string | undefined {
  if (!supertype) return undefined
  if (/pokémon|pokemon/i.test(supertype)) return 'Pokemon'
  if (/trainer/i.test(supertype)) return 'Trainer'
  if (/energy/i.test(supertype)) return 'Energy'
  return supertype
}

function mapBrief(card: PokemonTcgCard): CardBrief {
  return {
    id: card.id,
    name: card.name,
    localId: card.number ?? card.id.split('-').pop() ?? '',
    image: card.images?.small ?? card.images?.large,
    setId: card.set?.id,
  }
}

function mapNormalized(lang: CardLang, card: PokemonTcgCard): NormalizedCard {
  const image = card.images?.large ?? card.images?.small
  return {
    id: card.id,
    name: card.name,
    localId: String(card.number ?? ''),
    lang,
    image,
    imageBase: image,
    setId: card.set?.id,
    setName: card.set?.name,
    illustrator: card.artist,
    rarity: card.rarity,
    types: card.types,
    dexId: card.nationalPokedexNumbers,
    category: mapSupertype(card.supertype),
    stage: card.subtypes?.[0],
    regulationMark: card.regulationMark,
    effect: card.rules?.join(' '),
    hp: card.hp ? Number(card.hp) || undefined : undefined,
  }
}

function eurFromCard(card: PokemonTcgCard): number | null {
  const p = card.cardmarket?.prices
  return p?.averageSellPrice ?? p?.trendPrice ?? null
}

function usdFromPoint(point: PokemonTcgPricePoint | undefined): number | null {
  return point?.market ?? point?.mid ?? point?.low ?? null
}

function priceOf(card: PokemonTcgCard, tcgplayerKey?: string): CardPrice {
  const prices = card.tcgplayer?.prices
  const usd = tcgplayerKey
    ? usdFromPoint(prices?.[tcgplayerKey])
    : Object.values(prices ?? {}).reduce<number | null>((found, point) => {
        if (found != null) return found
        return usdFromPoint(point)
      }, null)
  return {
    eur: eurFromCard(card),
    usd,
    updated: Date.now(),
  }
}

function isSpeciesCardName(cardName: string, speciesName: string): boolean {
  const n = cardName.toLowerCase().trim()
  const s = speciesName.toLowerCase().trim()
  if (!s) return false
  if (n === s) return true
  try {
    const re = new RegExp(`(?:^|[^a-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`, 'i')
    return re.test(n)
  } catch {
    return n.includes(s)
  }
}

function buildSearchQuery(raw: string): string {
  const q = raw.trim()
  if (!q) return ''

  const stripped = q.replace(/^#/, '').trim()
  const frac = /^(\d+[a-zA-Z]?)\s*\/\s*(\d+)$/i.exec(stripped)
  if (frac) {
    return `number:"${frac[1]}"`
  }

  const cardIdMatch = /^([a-z0-9.]+)-(\d+[a-zA-Z]?)$/i.exec(stripped.replace(/\s+/g, ''))
  if (cardIdMatch) {
    return `id:${cardIdMatch[0].toLowerCase()}`
  }

  if (/^\d+[a-zA-Z]?$/i.test(stripped)) {
    return `number:"${stripped.replace(/^0+/, '') || stripped}"`
  }

  const safe = q.replace(/"/g, '')
  return `name:${safe}`
}

async function listPokemonTcgCards(q: string, pageSize = 250): Promise<PokemonTcgCard[]> {
  const all: PokemonTcgCard[] = []
  for (let page = 1; page <= 4; page++) {
    const params = new URLSearchParams({
      q,
      page: String(page),
      pageSize: String(pageSize),
    })
    const url = `${API_CONFIG.pokemonTcgIo.apiBaseUrl}/cards?${params}`
    try {
      const res = await fetchJson<PokemonTcgListResponse>(url, {
        timeoutMs: 8_000,
        maxRetries: 1,
      })
      const batch = (res.data ?? []).filter((c) => c?.id)
      all.push(...batch)
      const total = res.totalCount ?? all.length
      if (batch.length < pageSize || all.length >= total) break
    } catch (err) {
      if (err instanceof CatalogError && all.length) break
      throw err
    }
  }
  return all
}

/**
 * Minimal Pokémon TCG API client used when TCGdex is unreachable.
 * English catalog only — enough to restore repository add / card lookup.
 */
export async function searchPokemonTcgCards(
  query: string,
  page = 1,
  pageSize = 30,
): Promise<CardBrief[]> {
  const lucene = buildSearchQuery(query)
  if (!lucene) return []

  const params = new URLSearchParams({
    q: lucene,
    page: String(page),
    pageSize: String(pageSize),
  })
  const url = `${API_CONFIG.pokemonTcgIo.apiBaseUrl}/cards?${params}`

  try {
    const res = await fetchJson<PokemonTcgListResponse>(url, {
      timeoutMs: 8_000,
      maxRetries: 1,
    })
    const hits = (res.data ?? []).filter((c) => c?.id).map(mapBrief)
    if (hits.length) return hits
  } catch (err) {
    if (!(err instanceof CatalogError)) return []
  }

  const dexId = resolveDexId(resolvePokemonSearchTerms(query)[0] ?? query)
  if (!dexId) return []
  try {
    const cards = await listPokemonTcgCards(`nationalPokedexNumbers:${dexId}`)
    return cards.map(mapBrief).slice(0, pageSize)
  } catch {
    return []
  }
}

export async function getPokemonTcgCardById(
  lang: CardLang,
  id: string,
): Promise<NormalizedCard | null> {
  const url = `${API_CONFIG.pokemonTcgIo.apiBaseUrl}/cards/${encodeURIComponent(id)}`
  try {
    const res = await fetchJson<PokemonTcgCardResponse>(url, {
      timeoutMs: 8_000,
      maxRetries: 1,
    })
    if (!res.data?.id) return null
    return mapNormalized(lang, res.data)
  } catch {
    return null
  }
}

export async function fetchPokemonTcgSpeciesVariants(
  lang: CardLang,
  dexId: number,
  speciesName: string,
): Promise<CardVariant[]> {
  const entries = await fetchPokemonTcgSpeciesVariantEntries(lang, dexId, speciesName)
  return entries.map((v) => ({
    key: v.key,
    cardId: v.cardId,
    name: v.name,
    localId: v.localId,
    image: v.image,
    setName: v.setName,
    setId: v.setId,
    variant: v.variant,
    variantLabel: v.variantLabel,
    priceKey: v.key,
  }))
}

/** Full variant rows with market prices — used by the Pokédex picker. */
export async function fetchPokemonTcgSpeciesVariantEntries(
  lang: CardLang,
  dexId: number,
  speciesName: string,
): Promise<
  Array<{
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
  }>
> {
  let cards: PokemonTcgCard[] = []
  try {
    cards = await listPokemonTcgCards(`nationalPokedexNumbers:${dexId}`)
  } catch {
    return []
  }

  const matched = cards.filter((c) => isSpeciesCardName(c.name, speciesName))
  const pool = matched.length ? matched : cards

  const variants: Array<{
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
  }> = []

  for (const card of pool) {
    const image = card.images?.large ?? card.images?.small
    const localId = String(card.number ?? '')
    const priceKeys = Object.keys(card.tcgplayer?.prices ?? {}).filter(
      (key) => VARIANT_FROM_TCGPLAYER[key],
    )
    const kinds = priceKeys.length ? priceKeys : ['normal']

    for (const kind of kinds) {
      const meta = VARIANT_FROM_TCGPLAYER[kind] ?? VARIANT_FROM_TCGPLAYER.normal!
      variants.push({
        key: [card.id, lang, meta.variant].join('::'),
        cardId: card.id,
        name: card.name,
        localId,
        image,
        setName: card.set?.name,
        setId: card.set?.id,
        variant: meta.variant,
        variantLabel: meta.label,
        price: priceOf(card, kind === 'normal' && !card.tcgplayer?.prices?.normal ? undefined : kind),
      })
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
