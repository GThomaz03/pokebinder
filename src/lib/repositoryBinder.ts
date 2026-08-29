import { getCachedCard, getCachedPrice, priceToBrl } from '../api/prices'
import { baseCardId } from '../api/tcgdex'
import type { Binder, BinderPage, GridLayout, PriceMarket, Slot } from '../types'
import { defaultSettings, slotsPerPage } from '../types'
import { createEmptyPage, uid } from './binderUtils'

const UNKNOWN_DEX = 99999

export type InventoryEntry = { key: string; qty: number }

function sortKeyForCard(cardKey: string): {
  dex: number
  name: string
  setId: string
  localId: string
} {
  const cached = getCachedCard(baseCardId(cardKey)) ?? getCachedCard(cardKey)
  const dex = cached?.dexId?.[0] ?? UNKNOWN_DEX
  return {
    dex,
    name: (cached?.name ?? cardKey).toLowerCase(),
    setId: (cached?.setId ?? '').toLowerCase(),
    localId: String(cached?.localId ?? ''),
  }
}

function compareCardKeys(a: string, b: string): number {
  const ka = sortKeyForCard(a)
  const kb = sortKeyForCard(b)
  if (ka.dex !== kb.dex) return ka.dex - kb.dex
  if (ka.name !== kb.name) return ka.name.localeCompare(kb.name)
  if (ka.setId !== kb.setId) return ka.setId.localeCompare(kb.setId)
  return ka.localId.localeCompare(kb.localId, undefined, { numeric: true })
}

/** Expand inventory into ordered card keys for repository binder slots. */
export function expandRepositoryCardKeys(
  entries: InventoryEntry[],
  showDuplicates: boolean,
): string[] {
  const positive = entries.filter((e) => e.qty > 0)
  const sorted = [...positive].sort((a, b) => compareCardKeys(a.key, b.key))
  const keys: string[] = []
  for (const e of sorted) {
    const copies = showDuplicates ? e.qty : 1
    for (let i = 0; i < copies; i++) keys.push(e.key)
  }
  return keys
}

export function buildRepositoryPages(
  entries: InventoryEntry[],
  grid: GridLayout,
  showDuplicates: boolean,
): BinderPage[] {
  const perPage = slotsPerPage(grid)
  const keys = expandRepositoryCardKeys(entries, showDuplicates)
  const pages: BinderPage[] = []

  if (keys.length === 0) {
    return [createEmptyPage(grid), createEmptyPage(grid)]
  }

  for (let i = 0; i < keys.length; i += perPage) {
    const chunk = keys.slice(i, i + perPage)
    const slots: Slot[] = chunk.map((cardId) => ({ type: 'card', cardId }))
    while (slots.length < perPage) slots.push(null)

    const firstDex = sortKeyForCard(chunk[0]).dex
    const lastDex = sortKeyForCard(chunk[chunk.length - 1]).dex
    const label =
      firstDex === UNKNOWN_DEX && lastDex === UNKNOWN_DEX
        ? 'Outras'
        : firstDex === lastDex
          ? `#${String(firstDex).padStart(3, '0')}`
          : `#${String(Math.min(firstDex, lastDex)).padStart(3, '0')}–${String(
              Math.max(firstDex, lastDex),
            ).padStart(3, '0')}`

    pages.push({
      id: uid('page'),
      label,
      slots,
    })
  }

  if (pages.length % 2 === 1) {
    pages.push(createEmptyPage(grid, 'Extra'))
  }

  return pages
}

export function createRepositoryBinder(grid: GridLayout = '3x3'): Binder {
  const now = Date.now()
  return {
    id: uid('binder'),
    name: 'Repositório',
    kind: 'repository',
    grid,
    pages: [createEmptyPage(grid), createEmptyPage(grid)],
    settings: { ...defaultSettings(), showDuplicates: false },
    createdAt: now,
    updatedAt: now,
  }
}

/** Sum of inventory units (always full qty, ignores showDuplicates). */
export function inventoryCardCount(entries: InventoryEntry[]): number {
  return entries.reduce((sum, e) => sum + Math.max(0, e.qty), 0)
}

/** Sale value in BRL: price × qty for each inventory entry. */
export function inventoryTotalBrl(
  entries: InventoryEntry[],
  market: PriceMarket,
): number {
  let total = 0
  for (const e of entries) {
    if (e.qty <= 0) continue
    const brl = cardSaleBrl(e.key, market)
    if (brl != null) total += brl * e.qty
  }
  return total
}

/** Unit sale estimate in BRL for one inventory card key. */
export function cardSaleBrl(
  cardKey: string,
  market: PriceMarket = 'cardmarket',
): number | null {
  const price = getCachedPrice(cardKey) ?? getCachedCard(baseCardId(cardKey))?.price
  return priceToBrl(price, market)
}
