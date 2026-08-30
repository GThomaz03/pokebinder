/**
 * Export helpers for Liga Pokémon collection import/export CSV.
 *
 * Verified against a real LigaPokemon collection export (1 card):
 *   Edicao (PTBR), Edicao (EN), Edicao (Sigla), Card (PT), Card (EN),
 *   Quantidade, Qualidade, Idioma, Raridade, Cor, Extras, Card #,
 *   Comentario, # Cards na Edicao
 *
 * Set codes prefer Pokémon TCG `ptcgoCode` (what Liga usually matches).
 * Never emit raw catalog ids like SWSH12 / SV10PT — Liga returns
 * "Edição não encontrada" for those.
 */

import type { Binder, CachedCard, CardLang } from '../types'
import { baseCardId, normalizeCatalogSetId, parseOwnedKey } from '../api/cardKeys'
import { getCardsByIdsRepo } from '../api/cards/cardRepository'
import { getCachedCard, seedCardBrief } from '../api/prices'

export type LigaSetInfo = {
  abbreviation?: string
  nameEn?: string
  namePt?: string
  cardCount?: number
}

export type LigaExportRow = {
  qty: number
  nameEn: string
  namePt: string
  cardNumber: string
  setCode: string
  setNameEn: string
  setNamePt: string
  setCardCount: string
  quality: string
  language: string
  rarity: string
  color: string
  extras: string
  comment: string
  cardId: string
  setCodeGuess?: boolean
  /** True when Card (EN)/(PT) fell back to the card id (Liga will miss these). */
  missingCardName?: boolean
}

/**
 * Catalog set id → Liga / PTCGO abbreviation.
 * Source: Pokémon TCG data `ptcgoCode` (+ parent set for TG / GG variants).
 */
const LIGA_SET_CODES: Record<string, string> = {
  // Mega Evolution era
  me1: 'MEG',
  me2: 'PFL',
  me2pt5: 'ASC',
  me3: 'POR',
  me4: 'CRI',
  me5: 'PBL',
  // Scarlet & Violet
  sv1: 'SVI',
  sv2: 'PAL',
  sv3: 'OBF',
  sv3pt5: 'MEW',
  sv4: 'PAR',
  sv4pt5: 'PAF',
  sv5: 'TEF',
  sv6: 'TWM',
  sv6pt5: 'SFA',
  sv7: 'SCR',
  sv8: 'SSP',
  sv8pt5: 'PRE',
  sv9: 'JTG',
  sv10: 'DRI',
  // Black Bolt / White Flare (never export truncated SV10PT)
  zsv10pt5: 'BLK',
  rsv10pt5: 'WHT',
  sv10pt5: 'WHT',
  sve: 'SVE',
  svp: 'SVP',
  // Sword & Shield
  swsh1: 'SSH',
  swsh2: 'RCL',
  swsh3: 'DAA',
  swsh35: 'CPA',
  swsh4: 'VIV',
  swsh45: 'SHF',
  swsh45sv: 'SHF',
  swsh5: 'BST',
  swsh6: 'CRE',
  swsh7: 'EVS',
  swsh8: 'FST',
  swsh9: 'BRS',
  swsh9tg: 'BRS',
  swsh10: 'ASR',
  swsh10tg: 'ASR',
  swsh11: 'LOR',
  swsh11tg: 'LOR',
  swsh12: 'SIT',
  swsh12tg: 'SIT',
  swsh12pt5: 'CRZ',
  swsh12pt5gg: 'CRZ',
  swshp: 'PR-SW',
  cel25: 'CEL',
  pgo: 'PGO',
  mep: 'PR',
  mee: 'SVE',
}

/** Codes Liga rejected in a real import — never emit these as the sigla. */
const LIGA_REJECTED_CODES = new Set([
  'SV10PT',
  'SV10PT5',
  'SWSH12',
  'SWSHP',
  'SWSH11',
  'SWSH10',
  'SWSH9',
  'SWSH8',
  'SWSH7',
  'SWSH6',
  'SWSH5',
  'SWSH4',
  'SWSH3',
  'SWSH2',
  'SWSH1',
  'RSV10P',
  'ZSV10P',
])

/** Best-effort PT set titles used by Liga when we only have EN in catalog. */
const LIGA_SET_NAMES_PT: Record<string, string> = {
  JTG: 'Amigos de Jornada',
  PFL: 'Chamas Fantasmagóricas',
  CHR: 'Ascensão do Caos',
  CRI: 'Caos Ascendente',
  ASC: 'Heróis Ascendentes',
  POR: 'Ordem Perfeita',
  PBL: 'Escuridão Absoluta',
  MEG: 'Megaevolução',
  STS: 'Cerco de Vapor',
  SVI: 'Escarlate e Violeta',
  PAL: 'Evoluções em Paldea',
  OBF: 'Obsidiana em Chamas',
  MEW: '151',
  PAF: 'Destinos de Paldea',
  PAR: 'Fenda Paradoxal',
  TEF: 'Forças Temporais',
  TWM: 'Máscaras do Crepúsculo',
  SFA: 'Fábula Obscura',
  SCR: 'Coroa Estelar',
  SSP: 'Fagulhas Impetuosas',
  PRE: 'Evoluções Prismáticas',
  DRI: 'Rivais Predestinados',
  BLK: 'Raio Negro',
  WHT: 'Chama Branca',
  SSH: 'Espada e Escudo',
  SIT: 'Tempestade Prateada',
  CRZ: 'Zenith Supremo',
  LOR: 'Origem Perdida',
  ASR: 'Astral Radiance',
  BRS: 'Estrelas Brilhantes',
  SVP: 'Promo Escarlate e Violeta',
  'PR-SW': 'Promo Espada e Escudo',
  SVE: 'Energia Escarlate e Violeta',
}

/** Official printed totals as Liga stores them (# Cards na Edicao). */
const LIGA_SET_OFFICIAL_TOTALS: Record<string, string> = {
  ASC: '217',
  CRI: '086',
  PFL: '094',
  POR: '094',
  PBL: '084',
  JTG: '159',
  BLK: '086',
  WHT: '086',
  DRI: '182',
  PRE: '182',
}

const LIGA_SET_NAMES_EN: Record<string, string> = {
  SVI: 'Scarlet & Violet',
  PAL: 'Paldea Evolved',
  OBF: 'Obsidian Flames',
  MEW: '151',
  PAF: 'Paldean Fates',
  PAR: 'Paradox Rift',
  TEF: 'Temporal Forces',
  TWM: 'Twilight Masquerade',
  SFA: 'Shrouded Fable',
  SCR: 'Stellar Crown',
  SSP: 'Surging Sparks',
  PRE: 'Prismatic Evolutions',
  JTG: 'Journey Together',
  DRI: 'Destined Rivals',
  BLK: 'Black Bolt',
  WHT: 'White Flare',
  PFL: 'Phantasmal Flames',
  CRI: 'Chaos Rising',
  ASC: 'Ascended Heroes',
  POR: 'Perfect Order',
  PBL: 'Pitch Black',
  STS: 'Steam Siege',
  MEG: 'Mega Evolution',
  SIT: 'Silver Tempest',
  CRZ: 'Crown Zenith',
  LOR: 'Lost Origin',
  SVP: 'SV Black Star Promos',
  'PR-SW': 'SWSH Black Star Promos',
}

export const LIGA_CSV_HEADERS = [
  'Edicao (PTBR)',
  'Edicao (EN)',
  'Edicao (Sigla)',
  'Card (PT)',
  'Card (EN)',
  'Quantidade',
  'Qualidade (M NM SP MP HP D)',
  'Idioma (BR EN DE ES FR IT JP KO RU TW)',
  'Raridade (C I U R H E X U P A L S)',
  'Cor (C D O E Y F R G L M P W)',
  'Extras',
  'Card #',
  'Comentario',
  '# Cards na Edicao',
] as const

export function ligaSetCodeFor(
  setId: string | undefined,
  abbreviation?: string | null,
): { code: string; guess: boolean } {
  const catalog = setId ? normalizeCatalogSetId(setId) : ''
  const mapped =
    (catalog && LIGA_SET_CODES[catalog]) ||
    (setId && LIGA_SET_CODES[setId.toLowerCase()]) ||
    undefined
  if (mapped) return { code: mapped, guess: false }

  // Strip Trainer Gallery / Galarian Gallery suffixes then retry
  const parent = catalog.replace(/(tg|gg|sv)$/i, '')
  if (parent && parent !== catalog && LIGA_SET_CODES[parent]) {
    return { code: LIGA_SET_CODES[parent]!, guess: false }
  }

  const abbr = abbreviation?.trim().toUpperCase() ?? ''
  if (
    abbr &&
    !LIGA_REJECTED_CODES.has(abbr) &&
    !/^SWSH\d/i.test(abbr) &&
    !/^SV\d+PT/i.test(abbr) &&
    !/^(R|Z)?SV\d/i.test(abbr)
  ) {
    // Trust short PTCGO-like codes (incl. PR-SW)
    if (/^[A-Z]{2,4}$/.test(abbr) || /^PR-[A-Z]+$/.test(abbr)) {
      return { code: abbr, guess: false }
    }
  }

  // Do not invent SWSH12 / SV10PT — leave blank so Liga can use edition names.
  return { code: '', guess: true }
}

function stripLeadingZeros(num: string): string {
  const raw = String(num || '').trim()
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return String(Number(raw))
  return raw.replace(/^0+(?=\d)/, '') || raw
}

/** Liga CSV uses 3-digit collector numbers (029, 031, 110). */
export function ligaFormatCardNumber(num: string): string {
  const raw = String(num || '').trim()
  if (!raw) return ''
  const m = /^(\d+)([a-zA-Z]?)$/.exec(raw)
  if (m) return `${m[1].padStart(3, '0')}${m[2]}`
  return raw
}

/** Liga CSV uses 3-digit set totals (086, 159). */
export function ligaFormatSetTotal(count: string | number): string {
  const raw = String(count || '').trim()
  if (!raw || !/^\d+$/.test(raw)) return raw
  return raw.padStart(3, '0')
}

/** Map PokéBinder / TCGdex rarity labels → Liga single-letter codes. */
export function ligaRarityCode(rarity?: string | null): string {
  if (!rarity) return ''
  const r = rarity.toLowerCase()
  if (/special illustration|sir\b/.test(r)) return 'IS'
  if (/illustration rare|\bir\b/.test(r)) return 'I'
  if (/secret/.test(r)) return 'S'
  if (/ace spec|ace-spec/.test(r)) return 'A'
  if (/promo/.test(r)) return 'P'
  if (/ultra|double rare|\brr\b|ex\b|gx\b|vstar|vmax|\bv\b/.test(r)) return 'X'
  if (/hyper|amazing/.test(r)) return 'H'
  if (/holo/.test(r) && /rare/.test(r)) return 'H'
  if (/uncommon/.test(r)) return 'U'
  if (/common/.test(r)) return 'C'
  if (/rare/.test(r)) return 'R'
  return ''
}

/** Map Pokémon type → Liga "Cor" letter (from export legend). */
export function ligaColorCode(types?: string[] | null): string {
  const t = (types?.[0] ?? '').toLowerCase()
  if (!t) return ''
  if (/colorless|incolor/.test(t)) return 'C'
  if (/darkness|sombrio|dark/.test(t)) return 'D'
  if (/dragon|drag/.test(t)) return 'O'
  if (/fairy|fada/.test(t)) return 'Y'
  if (/fighting|lutador/.test(t)) return 'F'
  if (/fire|fogo/.test(t)) return 'R'
  if (/grass|planta|grama/.test(t)) return 'G'
  if (/lightning|el[eé]tric|raio/.test(t)) return 'L'
  if (/metal|met[aá]lic/.test(t)) return 'M'
  if (/psychic|ps[ií]quic/.test(t)) return 'P'
  if (/water|[aá]gua/.test(t)) return 'W'
  return ''
}

function ligaLanguageCode(lang?: CardLang): string {
  if (lang === 'pt') return 'BR'
  if (lang === 'en') return 'EN'
  if (lang === 'ja') return 'JP'
  return ''
}

function extrasFromVariant(parts: string[]): string {
  const joined = parts.join(' ').toLowerCase()
  if (/reverse/.test(joined)) return 'Reverse'
  if (/holo|holofoil/.test(joined)) return 'Foil'
  return ''
}

function looksLikeCardId(name: string, cardId: string): boolean {
  const n = name.trim().toLowerCase()
  const id = cardId.trim().toLowerCase()
  if (!n) return true
  if (n === id) return true
  // e.g. sv06-188 / svp-173
  return /^[a-z]{1,6}\d*(?:pt\d+)?(?:tg|gg)?-\d+[a-z]?$/i.test(n)
}

export function rowFromCachedCard(
  key: string,
  qty: number,
  card: CachedCard | undefined,
  setInfo?: LigaSetInfo | null,
  names?: { namePt?: string; nameEn?: string },
): LigaExportRow {
  const parsed = parseOwnedKey(key)
  const base = baseCardId(parsed.cardId)
  const dash = base.lastIndexOf('-')
  const setFromId = dash > 0 ? base.slice(0, dash) : card?.setId
  const numFromId = dash > 0 ? base.slice(dash + 1) : ''
  const localId = card?.localId || numFromId
  const { code, guess } = ligaSetCodeFor(card?.setId ?? setFromId, setInfo?.abbreviation)
  const rawName = card?.name?.trim() || ''
  const missingCardName = looksLikeCardId(rawName || base, base)
  const nameEn = missingCardName ? '' : names?.nameEn?.trim() || rawName || base
  const namePt = missingCardName ? '' : names?.namePt?.trim() || nameEn
  const setNamePt =
    (code ? LIGA_SET_NAMES_PT[code] : '') ||
    setInfo?.namePt?.trim() ||
    card?.setName?.trim() ||
    ''
  const setNameEn =
    (code ? LIGA_SET_NAMES_EN[code] : '') ||
    setInfo?.nameEn?.trim() ||
    card?.setName?.trim() ||
    setNamePt ||
    ''
  const cardNum = ligaFormatCardNumber(stripLeadingZeros(String(localId)))
  const setTotalRaw =
    setInfo?.cardCount && setInfo.cardCount > 0
      ? setInfo.cardCount
      : code && LIGA_SET_OFFICIAL_TOTALS[code]
        ? LIGA_SET_OFFICIAL_TOTALS[code]
        : ''
  const setTotal = setTotalRaw ? ligaFormatSetTotal(setTotalRaw) : ''

  return {
    qty: Math.max(0, Math.floor(qty)),
    nameEn,
    namePt,
    cardNumber: cardNum,
    setCode: code,
    setNameEn,
    setNamePt,
    setCardCount: setTotal,
    quality: 'NM',
    language: ligaLanguageCode(parsed.lang),
    rarity: ligaRarityCode(card?.rarity),
    color: ligaColorCode(card?.types),
    extras: extrasFromVariant(parsed.variantParts),
    comment: '',
    cardId: base,
    setCodeGuess: guess || !code,
    missingCardName,
  }
}

export type LigaExportStats = {
  total: number
  exportable: number
  missingName: number
  guessed: number
}

function cachedNameReady(card: CachedCard | undefined, cardId: string): boolean {
  if (!card?.name?.trim()) return false
  return !looksLikeCardId(card.name, cardId)
}

/** Collect inventory keys/qty from binder slots or repository list. */
export function collectExportEntries(
  binder?: Binder | null,
  inventoryEntries?: Array<{ key: string; qty: number }>,
): Array<{ key: string; qty: number }> {
  if (binder?.kind === 'repository' && inventoryEntries) {
    return inventoryEntries.filter((e) => e.qty > 0)
  }
  if (!binder) return (inventoryEntries ?? []).filter((e) => e.qty > 0)

  const counts = new Map<string, number>()
  for (const page of binder.pages) {
    for (const slot of page.slots) {
      if (!slot) continue
      if (slot.type === 'card' && slot.cardId) {
        counts.set(slot.cardId, (counts.get(slot.cardId) ?? 0) + 1)
      } else if (slot.type === 'pokedex') {
        const obtained =
          slot.obtained === true ||
          (slot.obtained === undefined &&
            Boolean(slot.topCardId || slot.ownedCardIds.length))
        if (!obtained) continue
        const ids =
          slot.ownedCardIds.length > 0
            ? slot.ownedCardIds
            : slot.topCardId
              ? [slot.topCardId]
              : []
        for (const key of ids) {
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
  }
  return [...counts.entries()].map(([key, qty]) => ({ key, qty }))
}

/**
 * Resolve card names from Supabase catalog (batch) and build Liga export rows.
 * Never calls hydrateCard or Pokémon TCG API.
 */
export async function prepareLigaExportData(
  lang: CardLang,
  entries: Array<{ key: string; qty: number }>,
  setInfoById?: Record<string, LigaSetInfo | undefined>,
): Promise<{
  rows: LigaExportRow[]
  stats: LigaExportStats
  namesById: Record<string, { namePt?: string; nameEn?: string }>
}> {
  const active = entries.filter((e) => e.qty > 0)
  const allIds = [...new Set(active.map((e) => baseCardId(e.key)))]

  const namesById: Record<string, { namePt?: string; nameEn?: string }> = {}

  if (allIds.length) {
    const [fetchedPt, fetchedEn] = await Promise.all([
      getCardsByIdsRepo('pt', allIds),
      getCardsByIdsRepo('en', allIds),
    ])
    for (const id of allIds) {
      const pt = fetchedPt.get(id)
      const en = fetchedEn.get(id) ?? pt
      const card = en ?? pt
      if (card) {
        seedCardBrief({
          id,
          name: en?.name ?? pt?.name ?? card.name,
          localId: card.localId,
          setId: card.setId,
          setName: card.setName,
          rarity: card.rarity,
          types: card.types,
          image: card.image,
        })
      }
      namesById[id] = {
        namePt: pt?.name,
        nameEn: en?.name ?? pt?.name,
      }
    }
  }

  for (const e of active) {
    const id = baseCardId(e.key)
    if (namesById[id]?.nameEn) continue
    const cached = getCachedCard(id)
    if (cached?.name && !looksLikeCardId(cached.name, id)) {
      namesById[id] = { nameEn: cached.name, namePt: cached.name }
    }
  }

  const rows = rowsFromInventory(active, getCachedCard, setInfoById, namesById)
  const exportable = rows.filter((r) => !r.missingCardName && r.nameEn.trim())
  return {
    rows,
    stats: {
      total: rows.length,
      exportable: exportable.length,
      missingName: rows.filter((r) => r.missingCardName).length,
      guessed: rows.filter((r) => r.setCodeGuess).length,
    },
    namesById,
  }
}

export function rowsFromInventory(
  entries: Array<{ key: string; qty: number }>,
  getCard: (id: string) => CachedCard | undefined,
  setInfoById?: Record<string, LigaSetInfo | undefined>,
  namesById?: Record<string, { namePt?: string; nameEn?: string } | undefined>,
): LigaExportRow[] {
  const byKey = new Map<string, LigaExportRow>()
  for (const e of entries) {
    if (e.qty <= 0) continue
    const card = getCard(baseCardId(e.key)) ?? getCard(e.key)
    const setId = card?.setId ?? ''
    const setFromKey = (() => {
      const base = baseCardId(e.key)
      const dash = base.lastIndexOf('-')
      return dash > 0 ? base.slice(0, dash) : ''
    })()
    const row = rowFromCachedCard(
      e.key,
      e.qty,
      card,
      setInfoById?.[setId] ?? setInfoById?.[setFromKey],
      namesById?.[baseCardId(e.key)],
    )
    const mergeKey = [
      row.setCode,
      row.cardNumber,
      row.nameEn,
      row.quality,
      row.language,
      row.extras,
    ]
      .join('|')
      .toLowerCase()
    const prev = byKey.get(mergeKey)
    if (prev) prev.qty += row.qty
    else byKey.set(mergeKey, row)
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.setCode.localeCompare(b.setCode) ||
      a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true }) ||
      a.nameEn.localeCompare(b.nameEn),
  )
}

export function rowsFromBinder(
  binder: Binder,
  getCard: (id: string) => CachedCard | undefined,
  setInfoById?: Record<string, LigaSetInfo | undefined>,
  inventory?: Array<{ key: string; qty: number }>,
): LigaExportRow[] {
  if (binder.kind === 'repository' && inventory) {
    return rowsFromInventory(inventory, getCard, setInfoById)
  }

  const counts = new Map<string, number>()
  for (const page of binder.pages) {
    for (const slot of page.slots) {
      if (!slot) continue
      if (slot.type === 'card' && slot.cardId) {
        const id = slot.cardId
        counts.set(id, (counts.get(id) ?? 0) + 1)
      } else if (slot.type === 'pokedex') {
        const obtained =
          slot.obtained === true ||
          (slot.obtained === undefined &&
            Boolean(slot.topCardId || slot.ownedCardIds.length))
        if (!obtained) continue
        const ids =
          slot.ownedCardIds.length > 0
            ? slot.ownedCardIds
            : slot.topCardId
              ? [slot.topCardId]
              : []
        for (const key of ids) {
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
  }

  const entries = [...counts.entries()].map(([key, qty]) => ({ key, qty }))
  return rowsFromInventory(entries, getCard, setInfoById)
}

function ligaCsvField(value: string, forceQuote = false): string {
  if (forceQuote || /[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Headers quoted like Liga's own export (columns with commas/spaces). */
const LIGA_CSV_HEADER_QUOTED = new Set([
  'Edicao (EN)',
  'Edicao (Sigla)',
  'Card (PT)',
  'Card (EN)',
  'Qualidade (M NM SP MP HP D)',
  'Idioma (BR EN DE ES FR IT JP KO RU TW)',
  'Raridade (C I U R H E X U P A L S)',
  'Cor (C D O E Y F R G L M P W)',
  'Extras',
  'Card #',
  'Comentario',
  '# Cards na Edicao',
])

/** Exact LigaPokemon Coleção CSV (14 columns). */
export function toLigaCollectionCsv(rows: LigaExportRow[]): string {
  const lines = [
    LIGA_CSV_HEADERS.map((h) => ligaCsvField(h, LIGA_CSV_HEADER_QUOTED.has(h))).join(','),
  ]
  for (const r of rows) {
    if (r.qty <= 0) continue
    if (r.missingCardName || !r.nameEn.trim()) continue
    lines.push(
      [
        ligaCsvField(r.setNamePt),
        ligaCsvField(r.setNameEn, true),
        ligaCsvField(r.setCode),
        ligaCsvField(r.namePt),
        ligaCsvField(r.nameEn),
        String(r.qty),
        ligaCsvField(r.quality),
        ligaCsvField(r.language),
        ligaCsvField(r.rarity),
        ligaCsvField(r.color),
        ligaCsvField(r.extras),
        ligaCsvField(r.cardNumber),
        ligaCsvField(r.comment),
        ligaCsvField(r.setCardCount),
      ].join(','),
    )
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function toLigaListTxt(rows: LigaExportRow[]): string {
  return rows
    .filter((r) => r.qty > 0 && !r.missingCardName && r.nameEn.trim())
    .map((r) => {
      // Liga list import (Bazar): qty + name + [SIGLA] + card# — NOT (number) before [SIGLA].
      // Parentheses before brackets are parsed as edition code (Magic legacy format).
      const name = (r.namePt?.trim() || r.nameEn).trim()
      const set = r.setCode ? ` [${r.setCode}]` : ''
      const num =
        r.cardNumber && r.setCardCount
          ? ` ${r.cardNumber}/${r.setCardCount}`
          : r.cardNumber
            ? ` ${r.cardNumber}`
            : ''
      return `${r.qty} ${name}${set}${num}`.trim()
    })
    .join('\n')
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function slugifyFilename(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 48) || 'export'
  )
}
