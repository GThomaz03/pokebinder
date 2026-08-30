import { API_CONFIG } from '../config'
import { catalogCardIdCandidates } from '../cardKeys'
import type { PricingBlock } from './pricingExtract'

export type PokemonTcgPricePoint = {
  low?: number | null
  mid?: number | null
  high?: number | null
  market?: number | null
  directLow?: number | null
}

export type PokemonTcgCardPricing = {
  id: string
  tcgplayer?: {
    updatedAt?: string
    prices?: Record<string, PokemonTcgPricePoint | undefined>
  }
  cardmarket?: {
    prices?: {
      averageSellPrice?: number | null
      trendPrice?: number | null
      lowPrice?: number | null
      avg30?: number | null
    }
  }
}

type PokemonTcgCardResponse = { data: PokemonTcgCardPricing }
type PokemonTcgListResponse = {
  data: PokemonTcgCardPricing[]
  page?: number
  pageSize?: number
  count?: number
  totalCount?: number
}

const TCGPLAYER_KEY_MAP: Record<string, string> = {
  normal: 'normal',
  holofoil: 'holofoil',
  reverseHolofoil: 'reverse-holofoil',
  '1stEdition': '1st-edition',
  '1stEditionHolofoil': '1st-edition-holofoil',
  unlimitedHolofoil: 'unlimited-holofoil',
}

export function pokemonTcgApiHeaders(): Record<string, string> {
  if (typeof window !== 'undefined') return {}
  const key = process.env.POKEMON_TCG_API_KEY?.trim()
  return key ? { 'X-Api-Key': key } : {}
}

async function fetchPokemonTcgJson<T>(url: string, timeoutMs = 15_000, retries = 2): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: pokemonTcgApiHeaders(),
      })
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}: ${url}`)
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
      return (await res.json()) as T
    } catch (err) {
      lastError = err
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt))
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Map Pokémon TCG API card payload → TCGdex-compatible pricing block. */
export function pricingFromPokemonTcgCard(
  card: PokemonTcgCardPricing,
): PricingBlock | undefined {
  const cm = card.cardmarket?.prices
  const tp = card.tcgplayer?.prices
  const block: PricingBlock = {}

  if (cm) {
    const avg = num(cm.averageSellPrice) ?? num(cm.trendPrice)
    block.cardmarket = {
      avg,
      trend: num(cm.trendPrice) ?? avg,
      low: num(cm.lowPrice),
    }
  }

  if (tp) {
    const mapped: NonNullable<PricingBlock['tcgplayer']> = {}
    for (const [rawKey, point] of Object.entries(tp)) {
      if (!point) continue
      const key = TCGPLAYER_KEY_MAP[rawKey] ?? rawKey
      mapped[key] = {
        marketPrice: num(point.market) ?? num(point.mid) ?? null,
        lowPrice: num(point.low) ?? null,
        highPrice: num(point.high) ?? null,
      }
    }
    if (Object.keys(mapped).length) block.tcgplayer = mapped
  }

  if (!block.cardmarket && !block.tcgplayer) return undefined
  return block
}

/** Row-shaped prices for Supabase `card_prices` upsert. */
export function catalogPricesFromPokemonTcg(card: PokemonTcgCardPricing | null | undefined): Array<{
  market: string
  low?: number
  mid?: number
  high?: number
  currency: string
  variant: string
}> {
  if (!card) return []
  const pricing = pricingFromPokemonTcgCard(card)
  if (!pricing) return []
  const rows: Array<{
    market: string
    low?: number
    mid?: number
    high?: number
    currency: string
    variant: string
  }> = []

  const cm = pricing.cardmarket
  if (cm && (cm.avg != null || cm.trend != null || cm.low != null)) {
    rows.push({
      market: 'cardmarket',
      low: cm.low ?? undefined,
      mid: cm.avg ?? cm.trend ?? undefined,
      high: cm['avg-holo'] ?? undefined,
      currency: 'EUR',
      variant: 'normal',
    })
  }

  const tpNormal = pricing.tcgplayer?.normal ?? Object.values(pricing.tcgplayer ?? {})[0]
  if (tpNormal?.marketPrice != null) {
    rows.push({
      market: 'tcgplayer',
      low: tpNormal.lowPrice ?? undefined,
      mid: tpNormal.marketPrice ?? undefined,
      high: tpNormal.highPrice ?? undefined,
      currency: 'USD',
      variant: 'normal',
    })
  }

  return rows
}

export async function fetchPokemonTcgCardPricing(
  cardId: string,
): Promise<PokemonTcgCardPricing | null> {
  for (const cid of catalogCardIdCandidates(cardId)) {
    const url = `${API_CONFIG.pokemonTcgIo.apiBaseUrl}/cards/${encodeURIComponent(cid)}`
    try {
      const res = await fetchPokemonTcgJson<PokemonTcgCardResponse>(url)
      if (res.data?.id) return res.data
    } catch {
      /* try next id candidate */
    }
  }
  return null
}

export async function fetchPokemonTcgSetCards(
  setId: string,
  page: number,
  pageSize = 250,
): Promise<PokemonTcgListResponse> {
  const params = new URLSearchParams({
    q: `set.id:${setId}`,
    page: String(page),
    pageSize: String(pageSize),
  })
  const url = `${API_CONFIG.pokemonTcgIo.apiBaseUrl}/cards?${params}`
  return fetchPokemonTcgJson<PokemonTcgListResponse>(url, 20_000)
}
