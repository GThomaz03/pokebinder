import type { CardLang } from '../../types'
import { API_CONFIG } from '../config'
import { fetchJson } from './http'
import {
  fetchCardRest,
  fetchDeckCardMeta,
  fetchSetsMeta,
  fetchSpeciesVariants,
  getCard,
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
    const sets = await fetchSetsMeta(lang)
    return sets.map((s) => ({ id: s.id, name: s.name }))
  },

  async getSet(lang, setId) {
    const all = await fetchSetsMeta(lang)
    const hit = all.find((s) => s.id === setId)
    if (hit) return hit
    if (lang !== 'en') {
      const en = await fetchSetsMeta('en')
      return en.find((s) => s.id === setId) ?? null
    }
    return null
  },

  async listSetCards(lang, setId) {
    type SetWithCards = {
      cards?: Array<{ id?: string; name?: string; localId?: string | number; image?: string }>
    }
    const langs: CardLang[] = lang === 'en' ? ['en'] : [lang, 'en']
    for (const L of langs) {
      try {
        const set = await fetchJson<SetWithCards>(
          `${API_CONFIG.tcgdex.baseUrl}/${L}/sets/${setId}`,
          { maxRetries: 2 },
        )
        const cards = set?.cards
        if (!cards?.length) continue
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
        /* try next lang */
      }
    }
    return []
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
