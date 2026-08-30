/** Shared types for ingestion pipeline (Node CLI + optional browser). */

export type ExternalSerie = {
  id: string
  name: string
  logo?: string
  releaseDate?: string
}

export type ExternalSet = {
  id: string
  name: string
  serieId?: string
  serieName?: string
  logo?: string
  symbol?: string
  cardCount?: { total?: number; official?: number }
  releaseDate?: string
}

export type ExternalCardSummary = {
  id: string
  name: string
  localId: string
  image?: string
  setId?: string
}

export type ExternalCard = {
  id: string
  name: string
  localId: string
  image?: string
  set?: { id?: string; name?: string }
  category?: string
  stage?: string
  trainerType?: string
  energyType?: string
  effect?: string
  hp?: number
  types?: string[]
  dexId?: number[]
  rarity?: string
  illustrator?: string
  regulationMark?: string
  legal?: { standard?: boolean; expanded?: boolean }
  variants?: Record<string, boolean>
  variants_detailed?: Array<{ type: string; stamp?: string[]; foil?: string }>
  pricing?: Record<string, unknown>
  attacks?: Array<{ name: string; cost?: string[]; damage?: string | number; effect?: string }>
  weaknesses?: Array<{ type: string; value: string }>
  resistances?: Array<{ type: string; value: string }>
  abilities?: Array<{ type?: string; name: string; effect?: string }>
  evolveFrom?: string
  description?: string
  raw?: Record<string, unknown>
}

export interface CardDataSource {
  readonly name: string
  getSeries(): Promise<ExternalSerie[]>
  getSets(): Promise<ExternalSet[]>
  getCards(setId: string): Promise<ExternalCardSummary[]>
  getCard(cardId: string, lang?: string): Promise<ExternalCard | null>
}

export type NormalizedCatalogCard = {
  canonicalId: string
  source: string
  sourceId: string
  name: string
  language: string
  number: string
  printedNumber?: string
  setSourceId: string
  category?: string
  stage?: string
  trainerType?: string
  energyType?: string
  effect?: string
  hp?: number
  types: string[]
  dexIds: number[]
  rarity?: string
  artist?: string
  regulationMark?: string
  legalities: Record<string, boolean>
  imageBase?: string
  imageHigh?: string
  imageLow?: string
  variants: Array<{
    variantType: string
    isHolo: boolean
    isReverseHolo: boolean
    isFirstEdition: boolean
    isShadowless: boolean
    isPromo: boolean
    sourceId?: string
  }>
  attacks: Array<{
    name: string
    cost: string[]
    damage?: string
    text?: string
    order: number
  }>
  weaknesses: Array<{ type: string; value: string }>
  resistances: Array<{ type: string; value: string }>
  rules: Array<{ ruleType: string; text: string; order: number }>
  translations: Array<{
    language: string
    name: string
    flavorText?: string
  }>
  prices: Array<{
    market: string
    low?: number
    mid?: number
    high?: number
    currency: string
    variant?: string
  }>
  rawData: Record<string, unknown>
}

export type SyncJobStats = {
  found: number
  created: number
  updated: number
  skipped: number
  failed: number
}
