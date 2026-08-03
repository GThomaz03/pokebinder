import type { CardLang } from '../../types'
import {
  fetchCardRest,
  fetchDeckCardMeta,
  fetchSets,
  fetchSpeciesVariants,
  getCard,
  getClient,
  searchCards,
  searchCardsAdvanced,
  type CardBrief,
  type CardSearchFilters,
  type CardVariantEntry,
  type DeckCardMeta,
  type DeckSearchHit,
} from '../tcgdex'
import { cardImageUrl, inferMissingImageCandidates } from '../images/imageProvider'
import type {
  CardProvider,
  CardVariant,
  NormalizedCard,
  SetCardBrief,
  SetMeta,
} from './types'

function mapNormalized(lang: CardLang, raw: Record<string, unknown>): NormalizedCard {
  const imageBase = raw.image as string | undefined
  let image = cardImageUrl(imageBase, 'high')
  if (!image) {
    image = inferMissingImageCandidates({
      cardId: String(raw.id),
      name: String(raw.name ?? ''),
      localId: raw.localId as string | number | undefined,
      energyType: raw.energyType as string | undefined,
    })[0]
  }
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    localId: String(raw.localId ?? ''),
    lang,
    image,
    imageBase,
    setId: (raw.set as { id?: string } | undefined)?.id,
    setName: (raw.set as { name?: string } | undefined)?.name,
    illustrator: raw.illustrator as string | undefined,
    rarity: raw.rarity as string | undefined,
    types: raw.types as string[] | undefined,
    dexId: raw.dexId as number[] | undefined,
    category: raw.category as string | undefined,
    stage: raw.stage as string | undefined,
    trainerType: raw.trainerType as string | undefined,
    energyType: raw.energyType as string | undefined,
    regulationMark: raw.regulationMark as string | undefined,
    effect: raw.effect as string | undefined,
    hp: raw.hp as number | undefined,
  }
}

function variantToInternal(v: CardVariantEntry): CardVariant {
  return {
    key: v.key,
    cardId: v.cardId,
    name: v.name,
    localId: v.localId,
    image: v.image,
    setName: v.setName,
    setId: v.setId,
    variant: v.variant,
    variantLabel: v.variantLabel,
    priceKey: v.key,
  }
}

function logoUrl(base?: string): string | undefined {
  if (!base) return undefined
  if (/\.(webp|png|jpg|jpeg)$/i.test(base)) return base
  return `${base}.webp`
}

/** TCGdex implementation of CardProvider — sole network access to api.tcgdex.net. */
export const tcgdexCardProvider: CardProvider = {
  async getById(lang, id) {
    const card = await getCard(lang, id)
    if (!card) return null
    return mapNormalized(lang, card as unknown as Record<string, unknown>)
  },

  search(lang, query, page = 1) {
    return searchCards(lang, query, page)
  },

  searchAdvanced(lang, filters: CardSearchFilters) {
    return searchCardsAdvanced(lang, filters)
  },

  async listSets(lang) {
    const sets = await fetchSets(lang)
    return sets.map((s) => ({ id: s.id, name: s.name }))
  },

  async getSet(lang, setId) {
    try {
      const set = await getClient(lang).set.get(setId)
      if (!set?.id) {
        if (lang !== 'en') return tcgdexCardProvider.getSet('en', setId)
        return null
      }
      const count = set.cardCount as { official?: number; total?: number } | undefined
      const abbr = (set as { abbreviation?: { official?: string } }).abbreviation?.official
      const meta: SetMeta = {
        id: set.id,
        name: set.name,
        logo: logoUrl(set.logo as string | undefined),
        symbol: logoUrl(set.symbol as string | undefined),
        cardCount: count?.official ?? count?.total ?? 0,
        releaseDate: (set as { releaseDate?: string }).releaseDate,
        abbreviation: abbr,
        serieName: (set as { serie?: { name?: string } }).serie?.name,
      }
      return meta
    } catch {
      if (lang !== 'en') return tcgdexCardProvider.getSet('en', setId)
      return null
    }
  },

  async listSetCards(lang, setId) {
    try {
      const set = await getClient(lang).set.get(setId)
      const cards = (set as { cards?: Array<{ id?: string; name?: string; localId?: string | number; image?: string }> } | null)
        ?.cards
      if (!cards?.length) {
        if (lang !== 'en') return tcgdexCardProvider.listSetCards('en', setId)
        return []
      }
      return cards
        .filter((c) => c?.id)
        .map((c): SetCardBrief => {
          const id = String(c.id)
          const name = String(c.name ?? '')
          const localId = String(c.localId ?? '')
          const imageBase = c.image
          let image = cardImageUrl(imageBase, 'low')
          if (!image) {
            image = inferMissingImageCandidates({
              cardId: id,
              name,
              localId,
            })[0]
          }
          return { id, name, localId, image, setId }
        })
    } catch {
      if (lang !== 'en') return tcgdexCardProvider.listSetCards('en', setId)
      return []
    }
  },

  async fetchSpeciesVariants(lang, dexId, speciesName) {
    const variants = await fetchSpeciesVariants(lang, dexId, speciesName)
    return variants.map(variantToInternal)
  },

  fetchDeckCardMeta(lang, cardId) {
    return fetchDeckCardMeta(lang, cardId)
  },

  fetchCardRest(lang, setId, localId) {
    return fetchCardRest(lang, setId, localId)
  },
}

export type { CardBrief, DeckCardMeta, DeckSearchHit, NormalizedCard }
