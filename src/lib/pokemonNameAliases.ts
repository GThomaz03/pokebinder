import pokedex from '../data/pokedex.json'
import ptNames from '../data/pokemonNamesPt.json'

const PT_TO_EN = ptNames as Record<string, string>

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/['’.]/g, '')
    .replace(/\s+/g, ' ')
}

/** Aliases that actually differ from the EN spelling (ignore identity rows). */
const DIFF_ALIASES: Array<{ pt: string; en: string }> = Object.entries(PT_TO_EN)
  .filter(([pt, en]) => normalizeKey(pt) !== normalizeKey(en))
  .map(([pt, en]) => ({ pt: normalizeKey(pt), en }))
  .sort((a, b) => b.pt.length - a.pt.length)

const EN_BY_NORM = new Map<string, string>()
const DEX_BY_NORM = new Map<string, number>()
for (const p of pokedex as Array<{ id: number; name: string }>) {
  EN_BY_NORM.set(normalizeKey(p.name), p.name)
  DEX_BY_NORM.set(normalizeKey(p.name), p.id)
}
for (const [pt, en] of Object.entries(PT_TO_EN)) {
  EN_BY_NORM.set(normalizeKey(pt), en)
  const id = DEX_BY_NORM.get(normalizeKey(en))
  if (id) DEX_BY_NORM.set(normalizeKey(pt), id)
}

/**
 * Expand a user search query into API-friendly name terms.
 * Maps Brazilian PT national names (Venossauro → Venusaur) and keeps the original.
 */
export function resolvePokemonSearchTerms(query: string): string[] {
  const q = query.trim()
  if (!q) return []

  const terms = new Set<string>([q])
  const key = normalizeKey(q)

  const direct = EN_BY_NORM.get(key)
  if (direct && normalizeKey(direct) !== key) {
    terms.add(direct)
  }

  // "Mega Venossauro ex" → also "Mega Venusaur ex" and "Venusaur"
  for (const { pt, en } of DIFF_ALIASES) {
    if (pt.length < 4) continue
    if (!key.includes(pt)) continue
    terms.add(en)
    const re = new RegExp(pt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    const spaced = q.replace(re, en)
    if (spaced !== q) terms.add(spaced)
    break
  }

  return [...terms]
}

/** National dex number for a species name (PT or EN), or a query that contains one. */
export function resolveDexId(query: string): number | null {
  const key = normalizeKey(query)
  if (!key) return null
  const exact = DEX_BY_NORM.get(key)
  if (exact) return exact

  let best: { id: number; len: number } | null = null
  for (const [name, id] of DEX_BY_NORM) {
    if (name.length < 4) continue
    if (!key.includes(name)) continue
    if (!best || name.length > best.len) best = { id, len: name.length }
  }
  return best?.id ?? null
}
