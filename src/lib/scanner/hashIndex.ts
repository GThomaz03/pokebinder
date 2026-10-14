import { RETRIEVAL_SHORTLIST } from './constants'
import { hashSimilarity } from './hash'
import type { HashFamily, ScanCard, VisualIndexHit } from './types'

export type HashIndexCard = ScanCard & {
  phash: string
  dhash: string
  phashR: string
  phashG: string
  phashB: string
}

export type HashIndexFile = {
  version: 1
  bits: number
  generatedAt?: string
  cardCount: number
  skipped?: number
  scope?: 'pilot' | 'catalog'
  cards: HashIndexCard[]
}

const HASH_KEYS = ['phash', 'dhash', 'phashR', 'phashG', 'phashB'] as const

export function parseHashIndex(value: unknown): HashIndexFile | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<HashIndexFile>
  if (raw.version !== 1 || !Array.isArray(raw.cards)) return null
  const cards = raw.cards.filter((card): card is HashIndexCard => {
    if (!card || typeof card !== 'object') return false
    const row = card as HashIndexCard
    return typeof row.id === 'string' && HASH_KEYS.every((key) => typeof row[key] === 'string' && row[key].length > 0)
  })
  if (!cards.length) return null
  return {
    version: 1,
    bits: typeof raw.bits === 'number' && raw.bits > 0 ? raw.bits : 256,
    generatedAt: raw.generatedAt,
    cardCount: cards.length,
    skipped: raw.skipped,
    scope: raw.scope,
    cards,
  }
}

export function indexCardToFamily(card: HashIndexCard): HashFamily {
  return {
    phash: hexToFamily(card.phash),
    dhash: hexToFamily(card.dhash),
    phashR: hexToFamily(card.phashR),
    phashG: hexToFamily(card.phashG),
    phashB: hexToFamily(card.phashB),
  }
}

function hexToFamily(hex: string): Uint8Array {
  const bits = new Uint8Array(hex.length * 4)
  for (let i = 0; i < hex.length; i++) {
    const nibble = Number.parseInt(hex[i] ?? '', 16)
    const value = Number.isFinite(nibble) ? nibble : 0
    for (let b = 0; b < 4; b++) bits[i * 4 + b] = (value >> (3 - b)) & 1
  }
  return bits
}

export function queryHashIndex(
  index: HashIndexFile,
  hashes: HashFamily,
  topK = RETRIEVAL_SHORTLIST,
): VisualIndexHit[] {
  const ranked: VisualIndexHit[] = []
  for (const card of index.cards) {
    const score = hashSimilarity(hashes, indexCardToFamily(card))
    ranked.push({ card, score })
  }
  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, topK)
}

export function mergeHashIndex(existing: HashIndexFile | null, additions: HashIndexCard[]): HashIndexFile {
  const byId = new Map<string, HashIndexCard>()
  for (const card of existing?.cards ?? []) byId.set(card.id, card)
  for (const card of additions) byId.set(card.id, card)
  const cards = [...byId.values()]
  return {
    version: 1,
    bits: existing?.bits ?? 256,
    generatedAt: new Date().toISOString(),
    cardCount: cards.length,
    scope: existing?.scope ?? 'pilot',
    cards,
  }
}

export type PilotRow = {
  id: string
  language?: string
  setId?: string
}

/**
 * Spreads a small sample across languages and sets.
 * Cards already indexed are ignored so a later run can add the rest.
 */
export function selectPilotSample<T extends PilotRow>(
  rows: T[],
  limit: number,
  alreadyIndexed: ReadonlySet<string> = new Set(),
  perSetCap = 6,
): T[] {
  const pending = rows.filter((row) => row.id && !alreadyIndexed.has(row.id))
  const byLang = new Map<string, T[]>()
  for (const row of pending) {
    const lang = row.language || 'unknown'
    const bucket = byLang.get(lang) ?? []
    bucket.push(row)
    byLang.set(lang, bucket)
  }
  const languages = [...byLang.keys()]
  const perLang = Math.max(1, Math.ceil(limit / Math.max(1, languages.length)))
  const picked: T[] = []
  const seen = new Set<string>()

  function take(row: T, setCounts: Map<string, number>, cap: number | null): boolean {
    if (picked.length >= limit || seen.has(row.id)) return false
    const setId = row.setId || ''
    const used = setCounts.get(setId) ?? 0
    if (cap !== null && setId && used >= cap) return false
    setCounts.set(setId, used + 1)
    seen.add(row.id)
    picked.push(row)
    return true
  }

  for (const lang of languages) {
    const setCounts = new Map<string, number>()
    let taken = 0
    for (const row of byLang.get(lang) ?? []) {
      if (taken >= perLang) break
      if (take(row, setCounts, perSetCap)) taken++
    }
    for (const row of byLang.get(lang) ?? []) {
      if (taken >= perLang) break
      if (take(row, setCounts, null)) taken++
    }
  }
  const setCounts = new Map<string, number>()
  for (const row of pending) {
    if (picked.length >= limit) break
    take(row, setCounts, null)
  }
  return picked
}
