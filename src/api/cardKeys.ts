import type { CardLang } from '../types'

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
