import { getCachedPrice, priceToBrl } from '../api/prices'
import type { Binder, BinderPage, GridLayout, Slot } from '../types'
import { defaultSettings, slotDisplayCardId, slotsPerPage } from '../types'
import pokedex from '../data/pokedex.json'

export type PokedexEntry = { id: number; name: string }

export const POKEDEX: PokedexEntry[] = pokedex as PokedexEntry[]

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export function emptySlots(count: number): Slot[] {
  return Array.from({ length: count }, () => null)
}

export function createEmptyPage(grid: GridLayout, label?: string): BinderPage {
  return {
    id: uid('page'),
    label,
    slots: emptySlots(slotsPerPage(grid)),
  }
}

export function createCustomBinder(name: string, grid: GridLayout = '3x3'): Binder {
  const now = Date.now()
  return {
    id: uid('binder'),
    name,
    kind: 'custom',
    grid,
    pages: [createEmptyPage(grid), createEmptyPage(grid)],
    settings: defaultSettings(),
    createdAt: now,
    updatedAt: now,
  }
}

export function createPokedexBinder(
  grid: GridLayout = '3x3',
  options?: { kind?: 'pokedex' | 'wishlist'; name?: string },
): Binder {
  const kind = options?.kind ?? 'pokedex'
  const perPage = slotsPerPage(grid)
  const pages: BinderPage[] = []
  let buffer: Slot[] = []

  for (const mon of POKEDEX) {
    buffer.push({
      type: 'pokedex',
      dexId: mon.id,
      ownedCardIds: [],
    })
    if (buffer.length === perPage) {
      pages.push({
        id: uid('page'),
        label: `#${String(mon.id - perPage + 1).padStart(3, '0')}–${String(mon.id).padStart(3, '0')}`,
        slots: buffer,
      })
      buffer = []
    }
  }

  if (buffer.length > 0) {
    while (buffer.length < perPage) buffer.push(null)
    const first = (buffer.find((s) => s?.type === 'pokedex') as { dexId: number } | undefined)?.dexId
    const last = [...buffer].reverse().find((s) => s?.type === 'pokedex') as
      | { dexId: number }
      | undefined
    pages.push({
      id: uid('page'),
      label:
        first && last
          ? `#${String(first).padStart(3, '0')}–${String(last.dexId).padStart(3, '0')}`
          : 'Pokédex',
      slots: buffer,
    })
  }

  if (pages.length % 2 === 1) {
    pages.push(createEmptyPage(grid, 'Extra'))
  }

  const now = Date.now()
  return {
    id: uid('binder'),
    name: options?.name ?? (kind === 'wishlist' ? 'Pokédex desejada' : 'Pokédex'),
    kind,
    grid,
    pages,
    settings: defaultSettings(),
    createdAt: now,
    updatedAt: now,
  }
}

export function createWishlistBinder(name: string, grid: GridLayout = '3x3'): Binder {
  return createPokedexBinder(grid, {
    kind: 'wishlist',
    name: name.trim() || 'Pokédex desejada',
  })
}

export function rebuildPagesForGrid(binder: Binder, grid: GridLayout): BinderPage[] {
  const perPage = slotsPerPage(grid)
  const pages: BinderPage[] = []

  if (binder.kind === 'pokedex' || binder.kind === 'wishlist') {
    const pokedexSlots = binder.pages
      .flatMap((p) => p.slots)
      .filter((s): s is Extract<Slot, { type: 'pokedex' }> => s?.type === 'pokedex')
      .sort((a, b) => a.dexId - b.dexId)

    for (let i = 0; i < pokedexSlots.length; i += perPage) {
      const chunk: Slot[] = pokedexSlots.slice(i, i + perPage)
      while (chunk.length < perPage) chunk.push(null)
      const first = pokedexSlots[i]?.dexId
      const last = pokedexSlots[Math.min(i + perPage - 1, pokedexSlots.length - 1)]?.dexId
      pages.push({
        id: uid('page'),
        label:
          first && last
            ? `#${String(first).padStart(3, '0')}–${String(last).padStart(3, '0')}`
            : undefined,
        slots: chunk,
      })
    }
  } else {
    const all = binder.pages.flatMap((p) => p.slots)
    const target = Math.max(all.length, perPage * 2)
    for (let i = 0; i < target; i += perPage) {
      const chunk: Slot[] = all.slice(i, i + perPage)
      while (chunk.length < perPage) chunk.push(null)
      pages.push({
        id: uid('page'),
        slots: chunk,
      })
    }
  }

  if (pages.length === 0) {
    pages.push(createEmptyPage(grid), createEmptyPage(grid))
  } else if (pages.length % 2 === 1) {
    pages.push(createEmptyPage(grid))
  }

  return pages
}

export function swapSlots(
  pages: BinderPage[],
  from: { pageIndex: number; slotIndex: number },
  to: { pageIndex: number; slotIndex: number },
): BinderPage[] {
  const next = pages.map((p) => ({ ...p, slots: [...p.slots] }))
  const a = next[from.pageIndex]?.slots[from.slotIndex]
  const b = next[to.pageIndex]?.slots[to.slotIndex]
  if (from.pageIndex === to.pageIndex && from.slotIndex === to.slotIndex) return pages
  if (!next[from.pageIndex] || !next[to.pageIndex]) return pages
  if (
    (a && 'pinned' in a && a.pinned) ||
    (b && 'pinned' in b && b.pinned)
  ) {
    return pages
  }
  next[from.pageIndex].slots[from.slotIndex] = b ?? null
  next[to.pageIndex].slots[to.slotIndex] = a ?? null
  return next
}

export function findEmptySlotsOnPage(
  page: BinderPage,
  count: number,
): number[] {
  const indexes: number[] = []
  for (let i = 0; i < page.slots.length && indexes.length < count; i++) {
    if (page.slots[i] === null) indexes.push(i)
  }
  return indexes
}

export function pokedexProgress(binder: Binder): { owned: number; total: number } {
  let owned = 0
  let total = 0
  for (const page of binder.pages) {
    for (const slot of page.slots) {
      if (slot?.type === 'pokedex') {
        total++
        if (slot.ownedCardIds.length > 0 || slot.topCardId) owned++
      }
    }
  }
  return { owned, total }
}

export function cardCount(binder: Binder): { filled: number; total: number } {
  let filled = 0
  let total = 0
  for (const page of binder.pages) {
    for (const slot of page.slots) {
      total++
      if (slot?.type === 'card') filled++
      if (slot?.type === 'pokedex' && (slot.topCardId || slot.ownedCardIds.length)) filled++
    }
  }
  return { filled, total }
}

/** Sum of cached card prices in BRL using the binder's selected market. */
export function binderTotalBrl(binder: Binder): number {
  let total = 0
  for (const page of binder.pages) {
    for (const slot of page.slots) {
      const id = slotDisplayCardId(slot)
      if (!id) continue
      const brl = priceToBrl(getCachedPrice(id), binder.settings.priceMarket)
      if (brl != null) total += brl
    }
  }
  return total
}

export function getPokedexName(dexId: number): string {
  return POKEDEX.find((p) => p.id === dexId)?.name ?? `#${dexId}`
}
