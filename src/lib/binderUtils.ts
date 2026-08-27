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
  options?: {
    kind?: 'pokedex' | 'wishlist'
    name?: string
    /** National dex IDs in slot order. Defaults to full National Dex. */
    dexIds?: number[]
  },
): Binder {
  const kind = options?.kind ?? 'pokedex'
  const perPage = slotsPerPage(grid)
  const pages: BinderPage[] = []
  let buffer: Slot[] = []
  const dexIds = options?.dexIds?.length
    ? options.dexIds
    : POKEDEX.map((m) => m.id)

  for (let i = 0; i < dexIds.length; i++) {
    const dexId = dexIds[i]!
    buffer.push({
      type: 'pokedex',
      dexId,
      ownedCardIds: [],
    })
    if (buffer.length === perPage) {
      const to = i + 1
      const from = to - perPage + 1
      pages.push({
        id: uid('page'),
        label: `#${String(from).padStart(3, '0')}–${String(to).padStart(3, '0')}`,
        slots: buffer,
      })
      buffer = []
    }
  }

  if (buffer.length > 0) {
    const from = dexIds.length - buffer.length + 1
    const to = dexIds.length
    while (buffer.length < perPage) buffer.push(null)
    pages.push({
      id: uid('page'),
      label: `#${String(from).padStart(3, '0')}–${String(to).padStart(3, '0')}`,
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

export function createWishlistBinder(
  name: string,
  grid: GridLayout = '3x3',
  dexIds?: number[],
): Binder {
  return createPokedexBinder(grid, {
    kind: 'wishlist',
    name: name.trim() || 'Pokédex desejada',
    dexIds,
  })
}

export function rebuildPagesForGrid(binder: Binder, grid: GridLayout): BinderPage[] {
  const perPage = slotsPerPage(grid)
  const pages: BinderPage[] = []

  if (binder.kind === 'pokedex' || binder.kind === 'wishlist') {
    // Preserve creation order (regional / game templates are not national order).
    const pokedexSlots = binder.pages
      .flatMap((p) => p.slots)
      .filter((s): s is Extract<Slot, { type: 'pokedex' }> => s?.type === 'pokedex')

    return packPokedexPages(pokedexSlots, grid)
  }

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

  if (pages.length === 0) {
    pages.push(createEmptyPage(grid), createEmptyPage(grid))
  } else if (pages.length % 2 === 1) {
    pages.push(createEmptyPage(grid))
  }

  return pages
}

/** Flat Pokédex slots in binder order (skips null padding). */
export function listPokedexSlots(binder: Binder): Extract<Slot, { type: 'pokedex' }>[] {
  return binder.pages
    .flatMap((p) => p.slots)
    .filter((s): s is Extract<Slot, { type: 'pokedex' }> => s?.type === 'pokedex')
}

/** Pack ordered Pokédex slots into pages with index-based labels. */
export function packPokedexPages(
  pokedexSlots: Extract<Slot, { type: 'pokedex' }>[],
  grid: GridLayout,
): BinderPage[] {
  const perPage = slotsPerPage(grid)
  const pages: BinderPage[] = []

  for (let i = 0; i < pokedexSlots.length; i += perPage) {
    const chunk: Slot[] = pokedexSlots.slice(i, i + perPage)
    while (chunk.length < perPage) chunk.push(null)
    const from = i + 1
    const to = Math.min(i + perPage, pokedexSlots.length)
    pages.push({
      id: uid('page'),
      label: `#${String(from).padStart(3, '0')}–${String(to).padStart(3, '0')}`,
      slots: chunk,
    })
  }

  if (pages.length === 0) {
    pages.push(createEmptyPage(grid), createEmptyPage(grid))
  } else if (pages.length % 2 === 1) {
    pages.push(createEmptyPage(grid, 'Extra'))
  }

  return pages
}

/**
 * Reorder Pokédex/wishlist slots by national dexId sequence.
 * Slot data (owned cards, top card, etc.) moves with each species.
 */
export function reorderPokedexByDexIds(
  binder: Binder,
  orderedDexIds: number[],
): BinderPage[] {
  if (binder.kind !== 'pokedex' && binder.kind !== 'wishlist') return binder.pages

  const current = listPokedexSlots(binder)
  const remaining = new Map<number, Extract<Slot, { type: 'pokedex' }>[]>()
  for (const s of current) {
    const list = remaining.get(s.dexId) ?? []
    list.push(s)
    remaining.set(s.dexId, list)
  }

  const ordered: Extract<Slot, { type: 'pokedex' }>[] = []
  for (const dexId of orderedDexIds) {
    const list = remaining.get(dexId)
    const next = list?.shift()
    if (next) ordered.push(next)
  }
  // Keep any slots not mentioned (shouldn't happen) at the end
  for (const list of remaining.values()) {
    ordered.push(...list)
  }

  return packPokedexPages(ordered, binder.grid)
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

/** Next empty slot starting at `from` (inclusive), scanning forward then wrapping. */
export function findNextEmptySlot(
  pages: BinderPage[],
  from: { pageIndex: number; slotIndex: number },
): { pageIndex: number; slotIndex: number } | null {
  if (!pages.length) return null
  const startPi = Math.max(0, Math.min(from.pageIndex, pages.length - 1))
  const startSi = Math.max(0, from.slotIndex)

  for (let pi = startPi; pi < pages.length; pi++) {
    const page = pages[pi]
    const fromSi = pi === startPi ? startSi : 0
    for (let si = fromSi; si < page.slots.length; si++) {
      if (page.slots[si] === null) return { pageIndex: pi, slotIndex: si }
    }
  }
  for (let pi = 0; pi <= startPi; pi++) {
    const page = pages[pi]
    const toSi = pi === startPi ? startSi : page.slots.length
    for (let si = 0; si < toSi; si++) {
      if (page.slots[si] === null) return { pageIndex: pi, slotIndex: si }
    }
  }
  return null
}

export function isSlotPinned(slot: Slot): boolean {
  return Boolean(slot && 'pinned' in slot && slot.pinned)
}

/** Collab: anyone can mutate empty/unpinned; pinned only blocked for move/clear. */
export function canClearOrMoveSlot(slot: Slot): boolean {
  return !isSlotPinned(slot)
}

export function canUnpinSlot(slot: Slot, userId: string | undefined): boolean {
  if (!slot || slot.type !== 'card' || !slot.pinned || !userId) return false
  return slot.pinnedBy === userId
}

/**
 * Place cards with overflow: if preferred slot is taken, use next empty.
 * Stamps placedBy on each card.
 */
export function placeCardsWithOverflow(
  pages: BinderPage[],
  preferred: { pageIndex: number; slotIndex: number },
  cardIds: string[],
  placedBy: string,
): { pages: BinderPage[]; placed: number; refs: { pageIndex: number; slotIndex: number }[] } {
  const next = pages.map((p) => ({ ...p, slots: [...p.slots] as Slot[] }))
  const refs: { pageIndex: number; slotIndex: number }[] = []
  let searchFrom = { ...preferred }

  for (const cardId of cardIds) {
    const occupant = next[searchFrom.pageIndex]?.slots[searchFrom.slotIndex] ?? undefined
    let dest: { pageIndex: number; slotIndex: number } | null =
      occupant === null ? searchFrom : null

    if (!dest) {
      dest =
        findNextEmptySlot(next, {
          pageIndex: searchFrom.pageIndex,
          slotIndex: searchFrom.slotIndex + 1,
        }) ?? findNextEmptySlot(next, { pageIndex: 0, slotIndex: 0 })
    }
    if (!dest) break

    next[dest.pageIndex].slots[dest.slotIndex] = {
      type: 'card',
      cardId,
      placedBy,
    }
    refs.push(dest)
    searchFrom = { pageIndex: dest.pageIndex, slotIndex: dest.slotIndex + 1 }
  }

  return { pages: next, placed: refs.length, refs }
}

export function pokedexProgress(binder: Binder): { owned: number; total: number } {
  let owned = 0
  let total = 0
  for (const page of binder.pages) {
    for (const slot of page.slots) {
      if (slot?.type === 'pokedex') {
        total++
        if (isPokedexOwned(slot, binder.kind)) owned++
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

/**
 * Whether a Pokédex/wishlist slot counts as "have it".
 * Wishlist: only `obtained === true`.
 * Pokédex: `obtained` when set; legacy slots (no flag) treat any card association as owned.
 */
export function isPokedexOwned(
  slot: Extract<Slot, { type: 'pokedex' }>,
  kind: Binder['kind'],
): boolean {
  if (kind === 'wishlist') return slot.obtained === true
  if (kind !== 'pokedex') return false
  if (slot.obtained === true) return true
  if (slot.obtained === false) return false
  // Legacy collection slots created before obtained was used on pokedex binders
  return slot.ownedCardIds.length > 0 || Boolean(slot.topCardId)
}
