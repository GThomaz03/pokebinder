import { canonicalizeTcgdexSetId, seriesFromSetId } from '../images/imageProvider'
import type { SetEdition } from './types'

export type CatalogSetRow = {
  sourceId: string
  name: string
  ptName?: string | null
  enName?: string | null
  jpName?: string | null
  logoUrl?: string | null
  symbolUrl?: string | null
  cardCount: number
  officialTotal?: number | null
  releaseDate?: string | null
  serieSlug?: string | null
}

export type GroupedSet = {
  id: string
  name: string
  cardCount: number
  cardCountOfficial?: number
  releaseDate?: string
  serieId?: string
  editions: SetEdition[]
  /** Logo attempts. Portuguese first whenever that edition exists. */
  covers: string[]
}

const ASSETS = 'https://assets.tcgdex.net'

/**
 * Sets whose publisher CDN has no logo. These files are the set's own logo
 * or, for products that were never given one, the set symbol or first card.
 */
const POKE_SYMBOL = 'https://pokesymbols.com/images/tcg/sets/symbols'
const VERIFIED_COVERS: Record<string, string> = {
  '2023sv': 'https://pokesymbols.com/images/tcg/sets/logos/mcdonald_s-match-battle-2023.png',
  '2024sv': 'https://pokesymbols.com/images/tcg/sets/logos/mcdonalds-collection-dragon-discovery-2024.png',
  'tk-bw-e': `${POKE_SYMBOL}/black-and-white-trainer-kit-excadrill.png`,
  'tk-bw-z': `${POKE_SYMBOL}/black-and-white-trainer-kit-zoroark.png`,
  'tk-sm-r': `${POKE_SYMBOL}/sun-and-moon-trainer-kit-raichu.png`,
  'tk-sm-l': `${POKE_SYMBOL}/sun-and-moon-trainer-kit-lycanroc.png`,
  'tk-xy-p': `${POKE_SYMBOL}/xy-trainer-kit-libre-pikachu.png`,
  'tk-xy-su': `${POKE_SYMBOL}/xy-trainer-kit-suicune.png`,
  'tk-xy-latia': `${POKE_SYMBOL}/xy-trainer-kit-latias.png`,
  'tk-xy-latio': `${POKE_SYMBOL}/xy-trainer-kit-latios.png`,
  'tk-xy-b': `${POKE_SYMBOL}/xy-trainer-kit-bisharp.png`,
  'tk-xy-w': `${POKE_SYMBOL}/xy-trainer-kit-wigglytuff.png`,
  'tk-xy-sy': `${POKE_SYMBOL}/xy-trainer-kit-sylveon.png`,
  'tk-xy-n': `${POKE_SYMBOL}/xy-trainer-kit-noivern.png`,
  'tk-hs-g': `${POKE_SYMBOL}/heartgold-and-soulsilver-trainer-kit-gyarados.png`,
  'tk-hs-r': `${POKE_SYMBOL}/heartgold-and-soulsilver-trainer-kit-raichu.png`,
  'tk-dp-l': `${POKE_SYMBOL}/diamond-and-pearl-trainer-kit-lucario.png`,
  'tk-dp-m': `${POKE_SYMBOL}/diamond-and-pearl-trainer-kit-manaphy.png`,
  'tk-ex-m': `${POKE_SYMBOL}/ex-trainer-kit-2-minun.png`,
  'tk-ex-p': `${POKE_SYMBOL}/ex-trainer-kit-2-plusle.png`,
  'tk-ex-latia': `${POKE_SYMBOL}/ex-trainer-kit-latias.png`,
  'tk-ex-latio': `${POKE_SYMBOL}/ex-trainer-kit-latios.png`,
}

export function foldSetName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/** TCGdex Japanese sets keep uppercase ids (`SM12`, `SV2a`). International ids do not. */
export function isJapaneseSetId(setId: string): boolean {
  return /[A-Z]/.test(setId)
}

function editionKey(row: CatalogSetRow): string {
  if (isJapaneseSetId(row.sourceId)) return `ja:${row.sourceId}`
  const folded = foldSetName((row.enName ?? '').trim() || row.name)
  if (folded.length < 3) return `id:${row.sourceId.toLowerCase()}`
  return `en:${folded}:${row.cardCount}`
}

function fileLogo(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed || /scrydex\.com/i.test(trimmed)) return null
  if (/\/logo$/i.test(trimmed)) return `${trimmed}.webp`
  return trimmed
}

function assetParts(url: string | null | undefined): { serie: string; id: string } | null {
  if (!url) return null
  const match = url.match(/assets\.tcgdex\.net\/(?:pt|en|ja|zh-tw|univ)\/([^/]+)\/([^/]+)\//i)
  if (!match?.[1] || !match[2]) return null
  return { serie: match[1], id: match[2] }
}

function rowParts(row: CatalogSetRow | undefined): { serie: string; id: string } | null {
  if (!row) return null
  return assetParts(row.logoUrl) ?? assetParts(row.symbolUrl)
}

function logoUrl(lang: 'pt' | 'en' | 'ja', serie: string, id: string): string {
  return `${ASSETS}/${lang}/${serie}/${id}/logo.webp`
}

function cardUrl(lang: 'pt' | 'en' | 'ja', serie: string, id: string, localId = '001'): string {
  return `${ASSETS}/${lang}/${serie}/${id}/${localId}/low.webp`
}

function assetLogo(lang: 'pt' | 'en' | 'ja', setId: string): string | null {
  if (lang === 'ja') {
    const serie = setId.match(/^[A-Za-z]+/)?.[0]?.toUpperCase()
    if (!serie) return null
    return logoUrl('ja', serie, setId)
  }
  const serie = seriesFromSetId(setId)
  if (!serie) return null
  return logoUrl(lang, serie, canonicalizeTcgdexSetId(setId))
}

function assetCard(lang: 'pt' | 'en' | 'ja', setId: string): string | null {
  if (lang === 'ja') {
    const serie = setId.match(/^[A-Za-z]+/)?.[0]?.toUpperCase()
    if (!serie) return null
    return cardUrl('ja', serie, setId)
  }
  const serie = seriesFromSetId(setId)
  if (!serie) return null
  return cardUrl(lang, serie, canonicalizeTcgdexSetId(setId))
}

function pokemonTcgLogo(setId: string): string {
  return `https://images.pokemontcg.io/${setId}/logo.png`
}

function push(urls: string[], url: string | null | undefined) {
  if (url && !urls.includes(url)) urls.push(url)
}

function coverCandidates(
  members: CatalogSetRow[],
  pt: CatalogSetRow | undefined,
  english: CatalogSetRow | undefined,
  ja: CatalogSetRow | undefined,
): string[] {
  const covers: string[] = []
  for (const member of members) push(covers, VERIFIED_COVERS[member.sourceId])

  if (ja && !pt && !english) {
    const parts = rowParts(ja)
    push(covers, assetLogo('ja', ja.sourceId))
    if (parts) {
      push(covers, logoUrl('ja', parts.serie, parts.id))
      push(covers, cardUrl('ja', parts.serie, parts.id))
      push(covers, cardUrl('en', parts.serie, parts.id))
    }
    push(covers, fileLogo(ja.logoUrl))
    push(covers, assetCard('ja', ja.sourceId))
    push(covers, `${ASSETS}/en/tcgp/${ja.sourceId}/001/low.webp`)
    push(covers, pokemonTcgLogo(ja.sourceId))
    return covers
  }

  const anchor = rowParts(pt) ?? rowParts(english) ?? members.map(rowParts).find(Boolean) ?? null
  if (pt) {
    if (anchor) push(covers, logoUrl('pt', anchor.serie, anchor.id))
    push(covers, assetLogo('pt', pt.sourceId))
    push(covers, fileLogo(pt.logoUrl))
    if (anchor) push(covers, cardUrl('pt', anchor.serie, anchor.id))
    push(covers, assetCard('pt', pt.sourceId))
  }
  if (english) {
    const enParts = rowParts(english)
    if (anchor) push(covers, logoUrl('en', anchor.serie, anchor.id))
    if (enParts) push(covers, logoUrl('en', enParts.serie, enParts.id))
    push(covers, assetLogo('en', english.sourceId))
    push(covers, fileLogo(english.logoUrl))
    if (!pt) {
      if (anchor) push(covers, cardUrl('en', anchor.serie, anchor.id))
      push(covers, assetCard('en', english.sourceId))
    }
  }
  for (const member of members) {
    push(covers, fileLogo(member.logoUrl))
    push(covers, pokemonTcgLogo(member.sourceId))
    if (/tg$/i.test(member.sourceId)) push(covers, `https://images.pokemontcg.io/${member.sourceId}/TG01.png`)
  }
  return covers
}

export function groupCatalogSets(rows: CatalogSetRow[]): GroupedSet[] {
  const buckets = new Map<string, CatalogSetRow[]>()
  for (const row of rows) {
    const key = editionKey(row)
    const list = buckets.get(key)
    if (list) list.push(row)
    else buckets.set(key, [row])
  }

  const groups: GroupedSet[] = []
  for (const members of buckets.values()) {
    const pt = members.find((row) => row.ptName?.trim() && !isJapaneseSetId(row.sourceId))
    const en = members.find((row) => !row.ptName?.trim() && !isJapaneseSetId(row.sourceId))
      ?? members.find((row) => !isJapaneseSetId(row.sourceId))
    const ja = members.find((row) => isJapaneseSetId(row.sourceId))
    const primary = pt ?? en ?? ja ?? members[0]
    if (!primary) continue

    const editions: SetEdition[] = []
    if (pt) editions.push({ id: pt.sourceId, lang: 'pt', name: pt.ptName!.trim() })
    const enRow = en && en.sourceId !== pt?.sourceId ? en : !pt ? en : undefined
    if (enRow) {
      editions.push({
        id: enRow.sourceId,
        lang: 'en',
        name: (enRow.enName ?? enRow.name).trim(),
      })
    } else if (pt?.enName?.trim() && pt.enName.trim() !== pt.ptName?.trim()) {
      editions.push({ id: pt.sourceId, lang: 'en', name: pt.enName.trim() })
    }
    if (ja && !pt && !en) {
      editions.push({
        id: ja.sourceId,
        lang: 'ja',
        name: (ja.jpName ?? ja.ptName ?? ja.name).trim(),
      })
    }

    const name = pt?.ptName?.trim()
      || (ja && !pt ? (ja.ptName ?? ja.jpName ?? ja.name).trim() : undefined)
      || primary.enName?.trim()
      || primary.name.trim()

    const release = members.map((row) => row.releaseDate).find((date) => date) ?? undefined
    groups.push({
      id: primary.sourceId,
      name,
      cardCount: Math.max(...members.map((row) => row.cardCount)),
      cardCountOfficial: primary.officialTotal ?? undefined,
      releaseDate: release ?? undefined,
      serieId: primary.serieSlug ?? undefined,
      editions,
      covers: coverCandidates(members, pt, enRow ?? en, ja),
    })
  }

  const nameCount = new Map<string, number>()
  for (const group of groups) nameCount.set(group.name, (nameCount.get(group.name) ?? 0) + 1)
  for (const group of groups) {
    if ((nameCount.get(group.name) ?? 0) > 1) group.name = `${group.name} · ${group.id}`
  }
  return groups
}
