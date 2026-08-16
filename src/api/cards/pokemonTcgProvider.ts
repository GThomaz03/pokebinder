import type { CardLang } from '../../types'
import { API_CONFIG } from '../config'
import { fetchJson, CatalogError } from './http'
import type { CardBrief, NormalizedCard } from './types'

type PokemonTcgImages = {
  small?: string
  large?: string
}

type PokemonTcgSet = {
  id?: string
  name?: string
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

  // Escape quotes in Lucene-ish query used by Pokémon TCG API
  const safe = q.replace(/"/g, '')
  return `name:"${safe}*"`
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
    return (res.data ?? []).filter((c) => c?.id).map(mapBrief)
  } catch (err) {
    if (err instanceof CatalogError) return []
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
