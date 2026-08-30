import type { CardLang } from '../../types'
import { API_CONFIG } from '../config'
import { baseCardId, catalogCardIdCandidates, normalizeCatalogCardId, normalizeCatalogSetId } from '../cardKeys'

export { baseCardId }

/** URLs that load card backs / 404 placeholders — must not be cached or reused. */
export function isLegacyCatalogImage(url: string | undefined | null): boolean {
  if (!url) return false
  // Any TCGdex CDN (assets.tcgdex.net, images.tcgdex.com, …) — often card-back placeholders.
  if (/tcgdex\.(net|com)/i.test(url)) return true
  if (/images\.pokemontcg\.io\/(me0\d|sv0\d)/i.test(url)) return true
  if (/images\.pokemontcg\.io\/[^/]*\d\.\d\//i.test(url)) return true
  return false
}

/** Scarlet & Violet Energy (sve) basic prints — reliable art for nameless TCGdex energies. */
const BASIC_ENERGY_SVE_INDEX: Record<string, number> = {
  grass: 1,
  planta: 1,
  grama: 1,
  fire: 2,
  fogo: 2,
  water: 3,
  água: 3,
  agua: 3,
  lightning: 4,
  elétrico: 4,
  eletrico: 4,
  raios: 4,
  psychic: 5,
  psíquico: 5,
  psichico: 5,
  fighting: 6,
  lutador: 6,
  lutadora: 6,
  darkness: 7,
  sombrio: 7,
  sombria: 7,
  metal: 8,
  metálica: 8,
  metalica: 8,
  fairy: 9,
  fada: 9,
  colorless: 10,
  incolor: 10,
}

function detectBasicEnergyTypeKey(name?: string, energyType?: string): string | null {
  const blob = `${name ?? ''} ${energyType ?? ''}`.toLowerCase()
  const keys = Object.keys(BASIC_ENERGY_SVE_INDEX).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (blob.includes(key)) return key
  }
  return null
}

/**
 * TCGdex asset paths are `{serie}/{set}/{localId}`. Promo/energy set ids often
 * start with the serie prefix plus an extra letter (`mep`, `mee`, `sve`), so a
 * naive "letters before digits" parse wrongly yields `mep` instead of `me`.
 * Prefer the longest known serie id that is a prefix of the set id.
 */
const SERIES_PREFIXES = [
  'swsh',
  'hgss',
  'tcgp',
  'ecard',
  'base',
  'gym',
  'neo',
  'pop',
  'col',
  'misc',
  'sm',
  'xy',
  'bw',
  'dp',
  'pl',
  'ex',
  'sv',
  'me',
  'tk',
  'lc',
  'mc',
].sort((a, b) => b.length - a.length)

/** Sets without art on images.pokemontcg.io — TCGdex CDN only. */
const POKEMON_TCG_IO_SKIP_SETS = new Set([
  'mep',
  'mee',
  'svp',
  'swshp',
  'smp',
  'xyp',
  'bwp',
  'dpp',
  'hsp',
])

/** Sets whose TCGdex records omit `image` and whose assets CDN has no art. */
const ENERGY_SET_IDS = new Set(['sve', 'mee'])

function pokemonTcgIoSupported(setId: string): boolean {
  const lower = setId.toLowerCase()
  if (POKEMON_TCG_IO_SKIP_SETS.has(lower)) return false
  if (/^(sv|swsh|sm|xy|bw|dp|pl|ex|me)[a-z]*p$/i.test(lower) && lower.length <= 6) return false
  return true
}

function seriesFromSetId(setId: string): string | undefined {
  const lower = setId.toLowerCase()
  for (const serie of SERIES_PREFIXES) {
    if (lower === serie || lower.startsWith(serie)) return serie
  }
  const m = /^([a-z]+)/i.exec(setId)
  return m?.[1]?.toLowerCase()
}

/**
 * TCGdex set ids use zero-padded forms (`sv03.5`). Short forms (`sv3.5`) 404 on
 * the assets CDN even though PokémonTCG.io uses `sv3pt5`.
 */
const TCGDEX_SET_ALIASES: Record<string, string> = {
  'sv3.5': 'sv03.5',
  'sv4.5': 'sv04.5',
  'sv6.5': 'sv06.5',
  'sv8.5': 'sv08.5',
  sv1: 'sv01',
  sv2: 'sv02',
  sv3: 'sv03',
  sv4: 'sv04',
  sv5: 'sv05',
  sv6: 'sv06',
  sv7: 'sv07',
  sv8: 'sv08',
  sv9: 'sv09',
}

export function canonicalizeTcgdexSetId(setId: string): string {
  const lower = setId.toLowerCase()
  return TCGDEX_SET_ALIASES[lower] ?? setId
}

export function toPokemonTcgIoSetId(setId: string): string {
  return normalizeCatalogSetId(setId)
}

const IMAGE_FILE_RE = /\.(webp|png|jpg|jpeg)(\?.*)?$/i
const IMAGE_QUALITY_RE = /\/(high|low)\.(webp|png|jpg|jpeg)(\?.*)?$/i
const POKEMON_TCG_IO_RE = /^https:\/\/images\.pokemontcg\.io\//i
const SCRYDEX_RE = /^https:\/\/images\.scrydex\.com\/pokemon\//i

function scrydexCandidates(url: string, quality: 'high' | 'low'): string[] {
  const out: string[] = []
  const large = /\/small$/i.test(url) ? url.replace(/\/small$/i, '/large') : url.replace(/\/large$/i, '/large')
  const small = /\/large$/i.test(url) ? url.replace(/\/large$/i, '/small') : url.replace(/\/small$/i, '/small')
  if (!/\/(large|small)$/i.test(url)) {
    pushUnique(out, `${url.replace(/\/$/, '')}/large`)
    pushUnique(out, `${url.replace(/\/$/, '')}/small`)
  } else {
    pushUnique(out, large)
    pushUnique(out, small)
  }
  return quality === 'high' ? out : [...out].reverse()
}

function scrydexCandidatesForCardId(cardId: string): string[] {
  const out: string[] = []
  for (const id of catalogCardIdCandidates(cardId)) {
    pushUnique(out, `https://images.scrydex.com/pokemon/${id}/large`)
    pushUnique(out, `https://images.scrydex.com/pokemon/${id}/small`)
  }
  return out
}

function pokemonTcgIoCandidates(url: string): string[] {
  const out: string[] = []
  const trimmed = url.replace(/\/$/, '')
  if (/_hires$/i.test(trimmed)) {
    pushUnique(out, `${trimmed}.png`)
    pushUnique(out, `${trimmed.replace(/_hires$/i, '')}.png`)
    return out
  }
  pushUnique(out, `${trimmed}.png`)
  pushUnique(out, `${trimmed}_hires.png`)
  return out
}

/** Strip `/high.webp` (etc.) so we can rebuild quality/format/locale variants. */
export function stripCardImageQuality(url: string): string {
  return url.replace(IMAGE_QUALITY_RE, '')
}

/**
 * TCGdex `image` is a CDN **base** without quality/extension. Using it raw in
 * `<img src>` always 404s — append `/{high|low}.webp`.
 */
export function cardImageUrl(
  imageBase: string | undefined,
  quality: 'high' | 'low' = 'low',
): string | undefined {
  if (!imageBase) return undefined
  if (IMAGE_QUALITY_RE.test(imageBase)) return imageBase
  if (IMAGE_FILE_RE.test(imageBase)) return imageBase
  if (SCRYDEX_RE.test(imageBase)) {
    const candidates = scrydexCandidates(imageBase, quality)
    return candidates[0]
  }
  return `${imageBase.replace(/\/$/, '')}/${quality}.webp`
}

export function cardImageCandidates(
  imageBase: string | undefined,
  quality: 'high' | 'low' = 'low',
): string[] {
  if (!imageBase) return []

  if (IMAGE_FILE_RE.test(imageBase)) {
    const out = [imageBase]
    if (/_hires\.(png|jpg|jpeg|webp)/i.test(imageBase)) {
      pushUnique(out, imageBase.replace(/_hires(\.(png|jpg|jpeg|webp))/i, '$1'))
    } else {
      pushUnique(out, imageBase.replace(/(\.(png|jpg|jpeg|webp))(\?.*)?$/i, '_hires$1'))
    }
    return quality === 'high' ? out : [...out].reverse()
  }

  if (POKEMON_TCG_IO_RE.test(imageBase)) {
    const out = pokemonTcgIoCandidates(imageBase)
    return quality === 'high' ? [...out].reverse() : out
  }

  if (SCRYDEX_RE.test(imageBase)) {
    return scrydexCandidates(imageBase, quality)
  }

  const root = stripCardImageQuality(imageBase).replace(/\/$/, '')
  const out: string[] = []
  const bases = [root]
  const enBase = root.replace(/\/(pt|ja)\//i, '/en/')
  if (enBase !== root) bases.push(enBase)
  // Prefer EN assets when the source was already EN-only — also try PT when EN given
  const ptBase = root.replace(/\/en\//i, '/pt/')
  if (ptBase !== root && !bases.includes(ptBase)) bases.push(ptBase)

  const qualities: Array<'high' | 'low'> =
    quality === 'low' ? ['low', 'high'] : ['high', 'low']

  for (const base of bases) {
    for (const q of qualities) {
      pushUnique(out, `${base}/${q}.webp`)
      pushUnique(out, `${base}/${q}.png`)
    }
  }
  return out
}

export function inferTcgdexImageBase(
  cardId: string,
  lang: CardLang = 'en',
  localId?: string | number,
): string | undefined {
  const id = baseCardId(cardId)
  const dash = id.lastIndexOf('-')
  if (dash <= 0) return undefined
  const setId = canonicalizeTcgdexSetId(id.slice(0, dash))
  const lid = String(localId ?? id.slice(dash + 1))
  const series = seriesFromSetId(setId)
  if (!series || !lid) return undefined
  return `${API_CONFIG.tcgdex.assetsBaseUrl}/${lang}/${series}/${setId}/${lid}`
}

function pushUnique(urls: string[], url: string) {
  if (!urls.includes(url)) urls.push(url)
}

function pushPokemonTcgIo(
  urls: string[],
  ioBase: string,
  setId: string,
  localIds: string[],
) {
  const ioSet = toPokemonTcgIoSetId(setId)
  // Prefer unpadded ids — images.pokemontcg.io uses `sve/1.png`, not `sve/001.png`.
  const ordered = [...localIds].sort((a, b) => a.length - b.length)
  for (const n of ordered) {
    pushUnique(urls, `${ioBase}/${ioSet}/${n}.png`)
    pushUnique(urls, `${ioBase}/${ioSet}/${n}_hires.png`)
  }
}

export function inferMissingImageCandidates(opts: {
  cardId: string
  name?: string
  localId?: string | number
  energyType?: string
}): string[] {
  const urls: string[] = []
  const id = baseCardId(opts.cardId)
  const dash = id.lastIndexOf('-')
  const setId = dash > 0 ? id.slice(0, dash) : ''
  const raw = dash > 0 ? String(opts.localId ?? id.slice(dash + 1)) : String(opts.localId ?? '')
  const stripped = raw.replace(/^0+/, '') || (raw ? '0' : '')
  const catalogId = normalizeCatalogCardId(id)
  const catalogDash = catalogId.lastIndexOf('-')
  const catalogNum = catalogDash > 0 ? catalogId.slice(catalogDash + 1) : ''
  const catalogSetId = catalogDash > 0 ? catalogId.slice(0, catalogDash) : normalizeCatalogSetId(setId)
  const localIds = [...new Set([raw, stripped, catalogNum].filter(Boolean))]
  const ioBase = API_CONFIG.pokemonTcgIo.imagesBaseUrl
  const typeKey = detectBasicEnergyTypeKey(opts.name, opts.energyType)
  const isEnergySet = ENERGY_SET_IDS.has(setId.toLowerCase()) || Boolean(typeKey)

  // Newer sets (me5, etc.) — Scrydex before pokemontcg.io / TCGdex assets.
  if (dash > 0) {
    for (const u of scrydexCandidatesForCardId(id)) pushUnique(urls, u)
  }

  // Basic Energy: TCGdex almost never ships `image`; prefer SVE prints on PokémonTCG.io.
  if (typeKey) {
    const n = BASIC_ENERGY_SVE_INDEX[typeKey]
    if (n) {
      pushUnique(urls, `${ioBase}/sve/${n}.png`)
      pushUnique(urls, `${ioBase}/sve/${n}_hires.png`)
    }
  }
  if (isEnergySet && setId && pokemonTcgIoSupported(setId)) {
    pushPokemonTcgIo(urls, ioBase, setId, localIds)
  }

  // PokémonTCG.io before TCGdex assets — TCGdex CDN often serves card-back placeholders for newer sets.
  if (dash > 0 && !isEnergySet && pokemonTcgIoSupported(catalogSetId)) {
    pushPokemonTcgIo(urls, ioBase, catalogSetId, localIds)
  }

  for (const lang of ['en', 'pt'] as const) {
    for (const lid of localIds.length ? localIds : ['']) {
      const base = inferTcgdexImageBase(id, lang, lid || undefined)
      if (!base) continue
      for (const u of cardImageCandidates(base, 'high')) {
        if (!isLegacyCatalogImage(u)) pushUnique(urls, u)
      }
      for (const u of cardImageCandidates(base, 'low')) {
        if (!isLegacyCatalogImage(u)) pushUnique(urls, u)
      }
    }
  }

  return urls.filter((u) => !isLegacyCatalogImage(u))
}



