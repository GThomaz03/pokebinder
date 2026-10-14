import { canonicalizeTcgdexSetId, seriesFromSetId } from '../images/imageProvider'
import type { SetEdition } from './types'

export type CatalogSetRow = {
  sourceId: string
  name: string
  ptName?: string | null
  enName?: string | null
  jpName?: string | null
  logoUrl?: string | null
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
  /** Logo attempts, Portuguese first, then English, then Japanese, then a card. */
  covers: string[]
}

const ASSETS = 'https://assets.tcgdex.net'

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
  if (!trimmed) return null
  if (/\/logo$/i.test(trimmed)) return `${trimmed}.webp`
  return trimmed
}

function assetLogo(lang: 'pt' | 'en' | 'ja', setId: string): string | null {
  if (lang === 'ja') {
    const serie = setId.match(/^[A-Za-z]+/)?.[0]?.toUpperCase()
    if (!serie) return null
    return `${ASSETS}/ja/${serie}/${setId}/logo.webp`
  }
  const serie = seriesFromSetId(setId)
  if (!serie) return null
  return `${ASSETS}/${lang}/${serie}/${canonicalizeTcgdexSetId(setId)}/logo.webp`
}

function assetCard(lang: 'pt' | 'en' | 'ja', setId: string): string | null {
  if (lang === 'ja') {
    const serie = setId.match(/^[A-Za-z]+/)?.[0]?.toUpperCase()
    if (!serie) return null
    return `${ASSETS}/ja/${serie}/${setId}/001/low.webp`
  }
  const serie = seriesFromSetId(setId)
  if (!serie) return null
  const id = canonicalizeTcgdexSetId(setId)
  return `${ASSETS}/${lang}/${serie}/${id}/001/low.webp`
}

function push(urls: string[], url: string | null | undefined) {
  if (url && !urls.includes(url)) urls.push(url)
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
    const pt = members.find((row) => row.ptName?.trim())
    const en = members.find((row) => !row.ptName?.trim() && !isJapaneseSetId(row.sourceId))
      ?? members.find((row) => !isJapaneseSetId(row.sourceId))
    const ja = members.find((row) => isJapaneseSetId(row.sourceId))
    const primary = pt ?? en ?? ja ?? members[0]
    if (!primary) continue

    const editions: SetEdition[] = []
    if (pt) {
      editions.push({ id: pt.sourceId, lang: 'pt', name: pt.ptName!.trim() })
    }
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
        name: (ja.jpName ?? ja.name).trim(),
      })
    }

    const name = pt?.ptName?.trim()
      || primary.ptName?.trim()
      || (ja && !pt ? (ja.jpName ?? ja.name).trim() : undefined)
      || primary.enName?.trim()
      || primary.name.trim()

    const covers: string[] = []
    if (pt) {
      push(covers, assetLogo('pt', pt.sourceId))
      push(covers, fileLogo(pt.logoUrl))
      push(covers, assetCard('pt', pt.sourceId))
    }
    const english = enRow ?? en
    if (english) {
      push(covers, assetLogo('en', english.sourceId))
      push(covers, fileLogo(english.logoUrl))
      if (!pt) push(covers, assetCard('en', english.sourceId))
    }
    if (ja && !pt && !english) {
      push(covers, assetLogo('ja', ja.sourceId))
      push(covers, fileLogo(ja.logoUrl))
      push(covers, assetCard('ja', ja.sourceId))
    }
    for (const member of members) push(covers, fileLogo(member.logoUrl))

    const release = members.map((row) => row.releaseDate).find((date) => date) ?? undefined
    groups.push({
      id: primary.sourceId,
      name,
      cardCount: Math.max(...members.map((row) => row.cardCount)),
      cardCountOfficial: primary.officialTotal ?? undefined,
      releaseDate: release ?? undefined,
      serieId: primary.serieSlug ?? undefined,
      editions,
      covers,
    })
  }
  return groups
}
