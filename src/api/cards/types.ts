import type { CardLang, DeckCategory } from '../../types'

/** Internal catalog card — no price fields. */
export type NormalizedCard = {
  id: string
  name: string
  localId: string
  lang: CardLang
  image?: string
  imageBase?: string
  setId?: string
  setName?: string
  illustrator?: string
  rarity?: string
  types?: string[]
  dexId?: number[]
  category?: DeckCategory | string
  stage?: string
  trainerType?: string
  energyType?: string
  regulationMark?: string
  effect?: string
  hp?: number
}

export type CardBrief = {
  id: string
  name: string
  localId: string | number
  image?: string
  setId?: string
}

export type SetMeta = {
  id: string
  name: string
  logo?: string
  symbol?: string
  cardCount: number
  releaseDate?: string
  abbreviation?: string
  serieName?: string
}

/** Brief card row from a set listing (`GET /sets/{id}` → cards[]). */
export type SetCardBrief = {
  id: string
  name: string
  localId: string
  image?: string
  setId?: string
}

export type CardVariant = {
  key: string
  cardId: string
  name: string
  localId: string
  image?: string
  setName?: string
  setId?: string
  variant: string
  variantLabel: string
  /** Optional price key for priceRepository — not embedded market data */
  priceKey?: string
}

export type CardSearchFilters = {
  name?: string
  category?: 'Pokemon' | 'Trainer' | 'Energy' | ''
  type?: string
  page?: number
  pageSize?: number
}

export type DeckSearchHit = CardBrief & {
  category?: string
  types?: string[]
  stage?: string
  rarity?: string
  setName?: string
  setId?: string
  trainerType?: string
  energyType?: string
  regulationMark?: string
  hp?: number
}

export type DeckCardMeta = {
  cardId: string
  name: string
  category: 'Pokemon' | 'Trainer' | 'Energy'
  types?: string[]
  stage?: string
  rarity?: string
  setId?: string
  setName?: string
  localId: string
  image?: string
  regulationMark?: string
  trainerType?: string
  energyType?: string
  effect?: string
  isBasicEnergy: boolean
  isAceSpec: boolean
  isRadiant: boolean
}

export type CardProvider = {
  getById(lang: CardLang, id: string): Promise<NormalizedCard | null>
  search(lang: CardLang, query: string, page?: number): Promise<CardBrief[]>
  searchAdvanced(lang: CardLang, filters: CardSearchFilters): Promise<DeckSearchHit[]>
  listSets(lang: CardLang): Promise<Array<{ id: string; name: string }>>
  getSet(lang: CardLang, setId: string): Promise<SetMeta | null>
  listSetCards(lang: CardLang, setId: string): Promise<SetCardBrief[]>
  fetchSpeciesVariants(
    lang: CardLang,
    dexId: number,
    speciesName: string,
  ): Promise<CardVariant[]>
  fetchDeckCardMeta(lang: CardLang, cardId: string): Promise<DeckCardMeta | null>
  /** Low-level REST get used by scanner */
  fetchCardRest(
    lang: CardLang,
    setId: string,
    localId: string,
  ): Promise<{
    id: string
    name: string
    localId: string | number
    image?: string
    set?: { id?: string; name?: string }
  } | null>
}
