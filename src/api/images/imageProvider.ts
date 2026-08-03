import type { CardLang } from '../../types'
import { API_CONFIG } from '../config'
import { baseCardId } from '../cardKeys'

export { baseCardId }

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

/** Sets whose TCGdex records omit `image` and whose assets CDN has no art. */
const ENERGY_SET_IDS = new Set(['sve', 'mee'])

function seriesFromSetId(setId: string): string | undefined {
  const lower = setId.toLowerCase()
  for (const serie of SERIES_PREFIXES) {
    if (lower === serie || lower.startsWith(serie)) return serie
  }
  const m = /^([a-z]+)/i.exec(setId)
  return m?.[1]?.toLowerCase()
}

export function toPokemonTcgIoSetId(setId: string): string {
  if (!setId.includes('.')) return setId
  return setId.replace(/0+(\d)/g, '$1').replace(/\./g, 'pt')
}

export function cardImageUrl(
  imageBase: string | undefined,
  quality: 'high' | 'low' = 'low',
): string | undefined {
  if (!imageBase) return undefined
  if (/\.(webp|png|jpg|jpeg)$/i.test(imageBase)) return imageBase
  return `${imageBase}/${quality}.webp`
}

export function cardImageCandidates(
  imageBase: string | undefined,
  quality: 'high' | 'low' = 'low',
): string[] {
  if (!imageBase) return []
  const primary = cardImageUrl(imageBase, quality)
  if (!primary) return []
  const out = [primary]
  const enBase = imageBase.replace(/\/(pt|ja)\//i, '/en/')
  if (enBase !== imageBase) {
    const en = cardImageUrl(enBase, quality)
    if (en && !out.includes(en)) out.push(en)
  }
  const otherQuality = quality === 'low' ? 'high' : 'low'
  const enOther = cardImageUrl(
    enBase !== imageBase ? enBase : imageBase.replace(/\/(pt|ja)\//i, '/en/'),
    otherQuality,
  )
  if (enOther && !out.includes(enOther)) out.push(enOther)
  return out
}

export function inferTcgdexImageBase(
  cardId: string,
  lang: CardLang = 'en',
  localId?: string | number,
): string | undefined {
  const id = baseCardId(cardId)
  const dash = id.indexOf('-')
  if (dash <= 0) return undefined
  const setId = id.slice(0, dash)
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
  const dash = id.indexOf('-')
  const setId = dash > 0 ? id.slice(0, dash) : ''
  const raw = dash > 0 ? String(opts.localId ?? id.slice(dash + 1)) : String(opts.localId ?? '')
  const stripped = raw.replace(/^0+/, '') || (raw ? '0' : '')
  const localIds = [...new Set([raw, stripped].filter(Boolean))]
  const ioBase = API_CONFIG.pokemonTcgIo.imagesBaseUrl
  const typeKey = detectBasicEnergyTypeKey(opts.name, opts.energyType)
  const isEnergySet = ENERGY_SET_IDS.has(setId.toLowerCase()) || Boolean(typeKey)

  // Basic Energy: TCGdex almost never ships `image`; prefer SVE prints on PokémonTCG.io.
  if (typeKey) {
    const n = BASIC_ENERGY_SVE_INDEX[typeKey]
    if (n) {
      pushUnique(urls, `${ioBase}/sve/${n}.png`)
      pushUnique(urls, `${ioBase}/sve/${n}_hires.png`)
    }
  }
  if (isEnergySet && setId) {
    pushPokemonTcgIo(urls, ioBase, setId, localIds)
  }

  for (const lang of ['en', 'pt'] as const) {
    for (const lid of localIds.length ? localIds : ['']) {
      const base = inferTcgdexImageBase(id, lang, lid || undefined)
      if (!base) continue
      for (const u of cardImageCandidates(base, 'high')) {
        pushUnique(urls, u)
      }
      for (const u of cardImageCandidates(base, 'low')) {
        pushUnique(urls, u)
      }
    }
  }

  if (dash > 0 && !isEnergySet) {
    pushPokemonTcgIo(urls, ioBase, setId, localIds)
  }

  return urls
}



