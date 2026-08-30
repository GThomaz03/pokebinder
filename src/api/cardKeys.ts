import type { CardLang } from '../types'

export function baseCardId(idOrKey: string): string {
  const i = idOrKey.indexOf('::')
  return i === -1 ? idOrKey : idOrKey.slice(0, i)
}

/** TCGdex ids (me02-002) → catalog ids (me2-2) used by Supabase / PokémonTCG.io. */
const CATALOG_SET_FROM_TCGDEX: Record<string, string> = {
  me01: 'me1',
  me02: 'me2',
  me03: 'me3',
  me04: 'me4',
  me05: 'me5',
  sv01: 'sv1',
  sv02: 'sv2',
  sv03: 'sv3',
  sv04: 'sv4',
  sv05: 'sv5',
  sv06: 'sv6',
  sv07: 'sv7',
  sv08: 'sv8',
  sv09: 'sv9',
  'sv03.5': 'sv3pt5',
  'sv04.5': 'sv4pt5',
  'sv06.5': 'sv6pt5',
  'sv08.5': 'sv8pt5',
}

export function normalizeCatalogSetId(setId: string): string {
  const lower = setId.toLowerCase()
  if (CATALOG_SET_FROM_TCGDEX[lower]) return CATALOG_SET_FROM_TCGDEX[lower]
  if (lower.includes('.')) {
    return lower.replace(/0+(\d)/g, '$1').replace(/\./g, 'pt')
  }
  const depad = /^([a-z]{1,4})0+(\d+(?:pt\d+)?)$/i.exec(lower)
  if (depad) return `${depad[1]}${depad[2]}`
  return lower
}

function normalizeCatalogNumber(num: string): string {
  return num.replace(/^0+(?=\d)/, '') || num
}

/** Map a user/TCGdex card id to the catalog canonical id when they differ. */
export function normalizeCatalogCardId(id: string): string {
  const base = baseCardId(id).toLowerCase()
  const dash = base.lastIndexOf('-')
  if (dash <= 0) return base
  const setId = normalizeCatalogSetId(base.slice(0, dash))
  const num = normalizeCatalogNumber(base.slice(dash + 1))
  return `${setId}-${num}`
}

/** Lookup ids to try against Supabase / PokémonTCG.io (original + normalized). */
export function catalogCardIdCandidates(id: string): string[] {
  const base = baseCardId(id).toLowerCase()
  const normalized = normalizeCatalogCardId(base)
  const out: string[] = []
  for (const cid of [base, normalized]) {
    if (cid && !out.includes(cid)) out.push(cid)
  }
  return out
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
