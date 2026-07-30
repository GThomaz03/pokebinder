import { searchCards } from '../../api/tcgdex'
import type { CardLang } from '../../types'
import type { CardCandidate, OcrHit, ScanResolveResult, SetIndex } from './types'

export type SetBrief = {
  id: string
  name: string
  official: number
  total: number
}

let setIndex: SetIndex | null = null
let setIndexPromise: Promise<SetIndex | null> | null = null
let setsCache: SetBrief[] | null = null

/** Fallback aliases if set-index.json is missing */
export const SET_ALIASES: Record<string, string> = {
  sv1: 'sv01',
  sv01: 'sv01',
  sve: 'sve',
  sv2: 'sv02',
  sv02: 'sv02',
  pal: 'sv02',
  sv3: 'sv03',
  sv03: 'sv03',
  obf: 'sv03',
  'sv3.5': 'sv03.5',
  sv3pt5: 'sv03.5',
  mew: 'sv03.5',
  sv4: 'sv04',
  sv04: 'sv04',
  par: 'sv04',
  'sv4.5': 'sv04.5',
  sv5: 'sv05',
  sv05: 'sv05',
  tef: 'sv05',
  sv6: 'sv06',
  sv06: 'sv06',
  twm: 'sv06',
  'sv6.5': 'sv06.5',
  sv6pt5: 'sv06.5',
  sv7: 'sv07',
  sv07: 'sv07',
  scr: 'sv07',
  sv8: 'sv08',
  sv08: 'sv08',
  ssp: 'sv08',
  'sv8.5': 'sv08.5',
  sv8pt5: 'sv08.5',
  pre: 'sv08.5',
  sv9: 'sv09',
  sv09: 'sv09',
  jtg: 'sv09',
  sv10: 'sv10',
  dri: 'sv10',
  me01: 'me01',
  m1: 'me01',
  mega: 'me01',
  me02: 'me02',
  m2: 'me02',
  pfl: 'me02',
  ev7: 'ev7',
  ev8: 'ev8',
  ev10: 'ev10',
  swsh12: 'swsh12',
  cel25: 'cel25',
}

export async function loadSetIndex(): Promise<SetIndex | null> {
  if (setIndex) return setIndex
  if (!setIndexPromise) {
    setIndexPromise = (async () => {
      try {
        const res = await fetch('/scan/set-index.json')
        if (!res.ok) return null
        setIndex = (await res.json()) as SetIndex
        return setIndex
      } catch {
        return null
      }
    })()
  }
  return setIndexPromise
}

export function normalizeSetToken(raw: string): string | undefined {
  const t = raw.toLowerCase().replace(/[^a-z0-9.]/g, '')
  if (!t) return undefined
  if (setIndex?.abbr[t]) return setIndex.abbr[t]
  if (SET_ALIASES[t]) return SET_ALIASES[t]
  if (/^[a-z]{1,8}\d{0,2}(\.\d)?$/.test(t)) return SET_ALIASES[t] ?? setIndex?.abbr[t] ?? t
  return undefined
}

export async function loadSetCatalog(lang: CardLang = 'en'): Promise<SetBrief[]> {
  const idx = await loadSetIndex()
  if (idx?.sets?.length) {
    setsCache = idx.sets
    return setsCache
  }
  if (setsCache) return setsCache
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/${lang}/sets`)
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as Array<{
      id: string
      name: string
      cardCount?: { official?: number; total?: number }
    }>
    setsCache = data.map((s) => ({
      id: s.id,
      name: s.name,
      official: s.cardCount?.official ?? 0,
      total: s.cardCount?.total ?? 0,
    }))
    return setsCache
  } catch {
    setsCache = []
    return setsCache
  }
}

export function localIdVariants(localId: string): string[] {
  const digits = localId.replace(/\D/g, '')
  const n = String(Number(digits || localId))
  if (!n || n === 'NaN') return [localId]
  return [...new Set([localId, n, n.padStart(2, '0'), n.padStart(3, '0')])]
}

type RestCard = {
  id: string
  name: string
  localId: string | number
  image?: string
  set?: { id?: string; name?: string }
}

async function fetchCardRest(lang: CardLang, setId: string, localId: string): Promise<RestCard | null> {
  const langs = lang === 'en' ? (['en'] as const) : ([lang, 'en'] as const)
  for (const lid of localIdVariants(localId)) {
    for (const L of langs) {
      try {
        const res = await fetch(`https://api.tcgdex.net/v2/${L}/cards/${setId}-${lid}`)
        if (!res.ok) continue
        const card = (await res.json()) as RestCard
        if (card?.id) return card
      } catch {
        // continue
      }
    }
  }
  return null
}

function cardImage(imageBase?: string): string | undefined {
  if (!imageBase) return undefined
  if (/\.(webp|png|jpg|jpeg)$/i.test(imageBase)) return imageBase
  return `${imageBase}/low.webp`
}

function toCandidate(card: RestCard, confidence: number, reason: string): CardCandidate {
  return {
    cardId: card.id,
    name: card.name,
    localId: String(card.localId),
    setId: card.set?.id ?? card.id.split('-')[0]!,
    setName: card.set?.name,
    image: cardImage(card.image),
    confidence,
    reason,
  }
}

function setPriority(setId: string): number {
  if (setId.startsWith('me')) return 30
  if (setId.startsWith('sv')) return 20
  if (setId.startsWith('swsh')) return 10
  return 0
}

/**
 * Resolve OCR fields into an ordered candidate list (no CLIP).
 */
export async function resolveCandidates(
  lang: CardLang,
  hit: OcrHit,
): Promise<ScanResolveResult> {
  await loadSetIndex()
  const sets = await loadSetCatalog(lang === 'ja' ? 'en' : lang)
  const byId = new Map<string, CardCandidate>()

  const add = (c: CardCandidate) => {
    const prev = byId.get(c.cardId)
    if (!prev || c.confidence > prev.confidence) byId.set(c.cardId, c)
  }

  // 1) Direct set + number
  if (hit.setId && hit.localId) {
    const card = await fetchCardRest(lang, hit.setId, hit.localId)
    if (card) add(toCandidate(card, Math.max(hit.confidence, 0.9), 'set+number'))
  }

  // 2) Number + set size (009/094)
  if (hit.localId && hit.setTotal) {
    const idx = await loadSetIndex()
    const fromIndex = idx?.byOfficial[String(hit.setTotal)] ?? []
    const fromCatalog = sets
      .filter((s) => s.official === hit.setTotal || s.total === hit.setTotal)
      .map((s) => s.id)
    const setIds = [...new Set([...fromIndex, ...fromCatalog])].sort(
      (a, b) => setPriority(b) - setPriority(a),
    )

    await Promise.all(
      setIds.slice(0, 6).map(async (setId) => {
        const card = await fetchCardRest(lang, setId, hit.localId!)
        if (card) {
          const boost = setPriority(setId) >= 20 ? 0.08 : 0
          add(toCandidate(card, Math.max(hit.confidence, 0.78) + boost, `size:${hit.setTotal}`))
        }
      }),
    )
  }

  // 3) Name hint
  if (hit.nameHint && hit.nameHint.length >= 3) {
    try {
      const results = (await searchCards(lang, hit.nameHint)) as Array<{
        id: string
        name: string
        localId: string | number
        image?: string
      }>
      let list = results
      if (hit.localId) {
        const n = String(Number(hit.localId))
        const filtered = list.filter((c) => String(Number(c.localId)) === n)
        if (filtered.length) list = filtered
      }
      for (const c of list.slice(0, 5)) {
        const setId = c.id.split('-')[0]!
        add({
          cardId: c.id,
          name: c.name,
          localId: String(c.localId),
          setId,
          image: cardImage(c.image),
          confidence: Math.max(hit.confidence, 0.7),
          reason: 'name',
        })
      }
    } catch {
      // ignore
    }
  }

  let candidates = [...byId.values()].sort((a, b) => b.confidence - a.confidence)

  // Name disambiguation boost
  if (hit.nameHint && candidates.length > 1) {
    const q = hit.nameHint.toLowerCase()
    candidates = candidates
      .map((c) => {
        const match =
          c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase().slice(0, 4))
        return match ? { ...c, confidence: Math.min(0.99, c.confidence + 0.12) } : c
      })
      .sort((a, b) => b.confidence - a.confidence)
  }

  const top = candidates[0]
  const ocr: OcrHit = {
    ...hit,
    cardId: top?.cardId,
    setId: top?.setId ?? hit.setId,
    localId: top?.localId ?? hit.localId,
    confidence: top ? Math.max(hit.confidence, top.confidence) : hit.confidence * 0.5,
  }

  return { ocr, candidates: candidates.slice(0, 5) }
}

/** @deprecated use resolveCandidates */
export async function resolveCardFromScan(lang: CardLang, hit: OcrHit): Promise<OcrHit> {
  const { ocr } = await resolveCandidates(lang, hit)
  return ocr
}

export async function tryGetCard(lang: CardLang, setId: string, localId: string) {
  return fetchCardRest(lang, setId, localId)
}
