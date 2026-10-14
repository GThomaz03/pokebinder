import type { CardLang } from '../../types'
import { normalizeCatalogSetId, baseCardId } from '../cardKeys'

/** Page size for name search in the add-card modal and deck builder. */
export const CATALOG_SEARCH_PAGE_SIZE = 40

/** PostgREST returns at most this many rows unless the caller pages explicitly. */
export const CATALOG_FETCH_PAGE_SIZE = 1000

const CATEGORY_ALIASES: Record<string, string[]> = {
  Pokemon: ['Pokemon', 'Pokémon'],
  Trainer: ['Trainer', 'Treinador'],
  Energy: ['Energy', 'Energia'],
}

/** English type keys used by the UI, plus the Portuguese values stored on some rows. */
const TYPE_ALIASES: Record<string, string[]> = {
  Grass: ['Grass', 'Planta'],
  Fire: ['Fire', 'Fogo'],
  Water: ['Water', 'Água'],
  Lightning: ['Lightning', 'Elétrico'],
  Psychic: ['Psychic', 'Psíquico'],
  Fighting: ['Fighting', 'Lutador'],
  Darkness: ['Darkness', 'Sombrio'],
  Metal: ['Metal'],
  Fairy: ['Fairy', 'Fada'],
  Dragon: ['Dragon', 'Dragão'],
  Colorless: ['Colorless', 'Incolor'],
}

export function categoryAliases(category: string): string[] {
  return CATEGORY_ALIASES[category] ?? [category]
}

export function typeAliases(type: string): string[] {
  return TYPE_ALIASES[type] ?? [type]
}

/**
 * TCGdex distinguishes English and Japanese sets by case (`sm12` vs `SM12`).
 * Try the requested id first. The normalized id is only a fallback for padded
 * ids such as `sv01` → `sv1`, and must not replace a case-distinct set.
 */
export function setSourceIdCandidates(setId: string): string[] {
  const exact = setId.trim()
  if (!exact) return []
  const normalized = normalizeCatalogSetId(exact)
  return normalized === exact ? [exact] : [exact, normalized]
}

export function resolveExistingSetId(
  requested: string,
  existing: ReadonlySet<string>,
): string | null {
  for (const id of setSourceIdCandidates(requested)) {
    if (existing.has(id)) return id
  }
  return null
}

/** Set id embedded in `canonical_id` (`sm12-25` → `sm12`). Case is significant. */
export function setIdFromCanonicalId(canonicalId: string): string {
  const base = baseCardId(canonicalId)
  const dash = base.lastIndexOf('-')
  return dash > 0 ? base.slice(0, dash) : base
}

export function canonicalBelongsToSet(canonicalId: string, setSourceId: string): boolean {
  return setIdFromCanonicalId(canonicalId) === setSourceId
}

/** Left-anchored LIKE pattern. `_` and `%` in the set id are escaped. */
export function canonicalIdLikePrefix(setSourceId: string): string {
  const escaped = setSourceId.replace(/[\\%_]/g, (ch) => `\\${ch}`)
  return `${escaped}-%`
}

/** Strip characters that break PostgREST `or`/`ilike` filters. */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[%_\\,()*]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function compareLocalIds(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
}

/** Printing language stored on `cards.language`, not a translated name. */
export function printingLanguage(language: string | null | undefined): CardLang {
  const value = (language ?? '').trim().toLowerCase()
  if (value === 'pt' || value === 'pt-br' || value === 'br') return 'pt'
  if (value === 'ja' || value === 'jp') return 'ja'
  return 'en'
}

/** Values of `cards.language` that belong to one nationality filter. */
export function dbLanguageValues(lang: CardLang): string[] {
  if (lang === 'pt') return ['pt-BR', 'pt']
  if (lang === 'ja') return ['ja', 'jp']
  return ['en']
}

export function numberSearchVariants(raw: string): string[] {
  const trimmed = raw.replace(/^#/, '')
  const slash = /^(\d+[a-zA-Z]?)\s*\/\s*\d+[a-zA-Z]?$/.exec(trimmed)
  const token = slash?.[1] ?? (/^\d+[a-zA-Z]?$/.test(trimmed) ? trimmed : null)
  if (!token) return []
  const stripped = token.replace(/^0+(?=\d)/, '')
  return [...new Set([token, stripped])]
}
