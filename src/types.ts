export type CardLang = 'pt' | 'en' | 'ja'

export type GridLayout = '2x2' | '3x3' | '4x3' | '4x4' | '4x5' | '5x4'

export type BinderKind = 'custom' | 'pokedex' | 'wishlist' | 'repository'

export type PriceMarket = 'cardmarket' | 'tcgplayer'

export type ToolMode = 'none' | 'select' | 'overview' | 'search' | 'collections'

export type CardSlot = {
  type: 'card'
  cardId: string
  pinned?: boolean
  /** Collab: user who pinned — only they can unpin */
  pinnedBy?: string
  /** Collab: user who placed the card (ownership border) */
  placedBy?: string
  /** Custom/collab: dim like wishlist “missing from inventory” */
  missing?: boolean
}

/** Used by both collection Pokédex and wishlist Pokédex binders */
export type PokedexSlot = {
  type: 'pokedex'
  dexId: number
  /** Owned (collection) or wanted (wishlist) card keys */
  ownedCardIds: string[]
  /** Card shown in the binder slot (desired target; may be unowned) */
  topCardId?: string
  pinned?: boolean
  /**
   * Have / don't have for the display card.
   * Wishlist + Pokédex collection: false/undefined = missing (grayscale), true = obtained.
   * Legacy Pokédex slots without this flag treat any topCardId/ownedCardIds as owned.
   */
  obtained?: boolean
}

export type Slot = null | CardSlot | PokedexSlot

export type BinderPage = {
  id: string
  label?: string
  slots: Slot[]
}

export type BinderSettings = {
  showPrices: boolean
  priceMarket: PriceMarket
  dimMissing: boolean
  emptyAsCardBack: boolean
  missingAsCardBack: boolean
  /** Repository binder: expand inventory qty into repeated slots */
  showDuplicates?: boolean
}

export type Binder = {
  id: string
  name: string
  kind: BinderKind
  grid: GridLayout
  pages: BinderPage[]
  settings: BinderSettings
  createdAt: number
  updatedAt: number
}

export type TrayItem = {
  id: string
  slot: CardSlot | PokedexSlot
  from?: { binderId: string; pageIndex: number; slotIndex: number }
}

/** Global card repository: key → quantity */
export type InventoryMap = Record<string, number>

export type CardPrice = {
  eur?: number | null
  usd?: number | null
  updated: number
}

export type CachedCard = {
  id: string
  name: string
  localId: string
  image?: string
  setName?: string
  setId?: string
  illustrator?: string
  rarity?: string
  types?: string[]
  dexId?: number[]
  price: CardPrice
}

export type SlotRef = { pageIndex: number; slotIndex: number }

/** Pokémon TCG deck building */
export type DeckCategory = 'Pokemon' | 'Trainer' | 'Energy'

export type DeckEntry = {
  cardId: string
  name: string
  qty: number
  category: DeckCategory
  types?: string[]
  stage?: string
  rarity?: string
  setId?: string
  setName?: string
  localId?: string
  image?: string
  regulationMark?: string
  trainerType?: string
  energyType?: string
  /** Basic Energy — unlimited copies by name */
  isBasicEnergy?: boolean
  isAceSpec?: boolean
  isRadiant?: boolean
}

export type Deck = {
  id: string
  name: string
  notes?: string
  cards: DeckEntry[]
  createdAt: number
  updatedAt: number
}

export const ENERGY_TYPES = [
  'Grass',
  'Fire',
  'Water',
  'Lightning',
  'Psychic',
  'Fighting',
  'Darkness',
  'Metal',
  'Fairy',
  'Dragon',
  'Colorless',
] as const

export type EnergyTypeName = (typeof ENERGY_TYPES)[number]

export const GRID_OPTIONS: GridLayout[] = ['2x2', '3x3', '4x3', '4x4', '4x5', '5x4']

export function gridCols(layout: GridLayout): number {
  return Number(layout.split('x')[0])
}

export function gridRows(layout: GridLayout): number {
  return Number(layout.split('x')[1])
}

export function slotsPerPage(layout: GridLayout): number {
  return gridCols(layout) * gridRows(layout)
}

/** Pokémon TCG card face ratio (width / height), in mm: 63 × 88. */
export const CARD_ASPECT = 63 / 88

/**
 * Aspect ratio (width / height) of a full page grid for `layout`.
 * Used by PageGrid so each cell lands card-shaped after the
 * cols×rows tracks split the measured box (gaps ignored — negligible at
 * typical page sizes).
 */
export function pageGridAspect(layout: GridLayout): number {
  return (gridCols(layout) / gridRows(layout)) * CARD_ASPECT
}

export function defaultSettings(): BinderSettings {
  return {
    showPrices: true,
    priceMarket: 'cardmarket',
    dimMissing: true,
    emptyAsCardBack: false,
    missingAsCardBack: false,
    showDuplicates: false,
  }
}

export function slotDisplayCardId(slot: Slot): string | undefined {
  if (!slot) return undefined
  if (slot.type === 'card') return slot.cardId
  return slot.topCardId
}
