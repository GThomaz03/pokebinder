export type SealedProductType =
  | 'booster'
  | 'blister'
  | 'booster_bundle'
  | 'booster_box'
  | 'etb'
  | 'tin'
  | 'collection_box'
  | 'build_battle'
  | 'premium_collection'
  | 'ultra_premium'
  | 'poster_collection'
  | 'binder_collection'
  | 'other'

export type SealedSet = {
  id: string
  name: string
  series?: string
  defaultBoosterPriceBrl: number
}

export type SealedProduct = {
  id: string
  /** '*' = template válido para qualquer set */
  setId: string | '*'
  name: string
  type: SealedProductType
  /** Quantidade de boosters equivalentes */
  packCount: number
  notes?: string
}

export type DealLevel = 'great' | 'good' | 'average' | 'expensive'

export type DealResult = {
  fairPrice: number
  promoPrice: number
  diff: number
  pct: number
  level: DealLevel
  packCount: number
  boosterPrice: number
}
