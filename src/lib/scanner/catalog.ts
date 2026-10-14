import { searchCardsRepo } from '../../api/cards/cardRepository'
import { cardImageCandidates } from '../../api/images/imageProvider'
import { supabase } from '../../lib/supabase'
import type { CardLang } from '../../types'
import { VISUAL_COMPARE_LIMIT } from './constants'
import type { ScanCard } from './types'

const CARD_SELECT = `
  canonical_id, name, number, language, image_low_url, image_url, image_high_url,
  sets (source_id, name, pt_name, en_name, printed_total, official_total, total_cards)
`

/** Printed set codes that the catalog stores under a different source id. */
const SET_CODE_ALIASES: Record<string, string[]> = {
  PAL: ['sv2', 'sv02'],
  OBF: ['sv3', 'sv03'],
  MEW: ['sv3pt5', 'sv03.5'],
  PAR: ['sv4', 'sv04'],
  TEF: ['sv5', 'sv05'],
  TWM: ['sv6', 'sv06'],
  SCR: ['sv7', 'sv07'],
  SSP: ['sv8', 'sv08'],
  PRE: ['sv8pt5', 'sv08.5'],
  JTG: ['sv9', 'sv09'],
  DRI: ['sv10'],
  MEG: ['me1', 'me01'],
  PFL: ['me2', 'me02'],
}

type DbSet = {
  source_id?: string
  name?: string
  pt_name?: string | null
  en_name?: string | null
  printed_total?: number | null
  official_total?: number | null
  total_cards?: number | null
}

type DbRow = {
  canonical_id: string
  name: string
  number: string | null
  language: string | null
  image_low_url: string | null
  image_url: string | null
  image_high_url: string | null
  sets?: DbSet | DbSet[] | null
}

function asSet(sets: DbRow['sets']): DbSet | null {
  if (!sets) return null
  return Array.isArray(sets) ? (sets[0] ?? null) : sets
}

function dbLang(lang: CardLang): string {
  return lang === 'pt' ? 'pt-BR' : lang
}

function mapRow(row: DbRow, lang: CardLang): ScanCard {
  const set = asSet(row.sets)
  const setName = lang === 'pt' ? (set?.pt_name ?? set?.name) : (set?.en_name ?? set?.name)
  const image = row.image_low_url ?? row.image_url ?? row.image_high_url ?? undefined
  return {
    id: row.canonical_id,
    name: row.name,
    localId: row.number ?? '',
    setId: set?.source_id,
    setName: setName ?? undefined,
    image,
    language: row.language ?? undefined,
    setTotal: set?.printed_total ?? set?.official_total ?? set?.total_cards ?? undefined,
  }
}

function numberVariants(number: string): string[] {
  const n = String(Number(number))
  return [...new Set([n, n.padStart(2, '0'), n.padStart(3, '0')])]
}

function preferLanguage(cards: ScanCard[], lang: CardLang): ScanCard[] {
  const wanted = dbLang(lang)
  return [...cards].sort((a, b) => {
    const ap = a.language === wanted || a.language === lang ? 0 : 1
    const bp = b.language === wanted || b.language === lang ? 0 : 1
    return ap - bp
  })
}

function narrow(cards: ScanCard[], total: number | null, setCode: string | null): ScanCard[] {
  let next = cards
  if (total && total > 0) {
    const matched = next.filter((card) => card.setTotal === total)
    if (matched.length) next = matched
  }
  if (setCode) {
    const aliases = new Set([setCode.toLowerCase(), ...(SET_CODE_ALIASES[setCode] ?? []).map((id) => id.toLowerCase())])
    const matched = next.filter((card) => card.setId && aliases.has(card.setId.toLowerCase()))
    if (matched.length) next = matched
  }
  return next
}

export async function lookupByCollector(query: {
  number: string
  total: number | null
  setCode: string | null
  lang: CardLang
}): Promise<ScanCard[]> {
  if (!/^\d{1,4}$/.test(query.number)) return []
  const fromDb = await lookupSupabase(query)
  const cards = fromDb.length ? fromDb : await lookupFallback(query)
  return preferLanguage(narrow(cards, query.total, query.setCode), query.lang).slice(0, VISUAL_COMPARE_LIMIT)
}

async function lookupSupabase(query: {
  number: string
  total: number | null
  setCode: string | null
  lang: CardLang
}): Promise<ScanCard[]> {
  if (!supabase) return []
  if (query.total) {
    const bySet = await lookupInSetsOfSize(query.total, query.number, query.lang)
    if (bySet.length) return bySet
  }
  const variants = numberVariants(query.number)
  const filter = variants.flatMap((value) => [`number.eq.${value}`, `printed_number.eq.${value}`]).join(',')
  const { data, error } = await supabase.from('cards').select(CARD_SELECT).or(filter).limit(40)
  if (error || !data?.length) return []
  return (data as DbRow[]).map((row) => mapRow(row, query.lang))
}

const setIdsByTotal = new Map<number, string[]>()

async function lookupInSetsOfSize(total: number, number: string, lang: CardLang): Promise<ScanCard[]> {
  if (!supabase || total < 20 || total > 400) return []
  let setIds = setIdsByTotal.get(total)
  if (!setIds) {
    const { data, error } = await supabase
      .from('sets')
      .select('id')
      .or(`official_total.eq.${total},printed_total.eq.${total},total_cards.eq.${total}`)
    if (error || !data?.length) return []
    setIds = data.map((row) => row.id as string)
    setIdsByTotal.set(total, setIds)
  }
  const variants = numberVariants(number)
  const filter = variants.flatMap((value) => [`number.eq.${value}`, `printed_number.eq.${value}`]).join(',')
  const { data, error } = await supabase
    .from('cards')
    .select(CARD_SELECT)
    .in('set_id', setIds)
    .or(filter)
    .limit(40)
  if (error || !data?.length) return []
  return (data as DbRow[]).map((row) => mapRow(row, lang))
}

async function lookupFallback(query: {
  number: string
  total: number | null
  setCode: string | null
  lang: CardLang
}): Promise<ScanCard[]> {
  try {
    const needle = query.total ? `${query.number}/${query.total}` : query.number
    const briefs = await searchCardsRepo(query.lang, needle)
    return briefs.map((brief) => ({
      id: brief.id,
      name: brief.name,
      localId: String(brief.localId),
      setId: brief.setId,
      image: brief.image,
    }))
  } catch {
    return []
  }
}

export function referenceUrls(card: ScanCard): string[] {
  return cardImageCandidates(card.image, 'low')
}
