import type { Binder } from '../types'
import { isPokedexOwned, listPokedexSlots } from './binderUtils'

export { isPokedexOwned }

export const PLACEHOLDER_PER_PAGE = 9

/**
 * Dex IDs in binder order for the placeholder sheets.
 * By default only missing species; pass includeOwned to get the full binder list.
 */
export function listPlaceholderDexIds(
  binder: Binder,
  options?: { includeOwned?: boolean },
): number[] {
  if (binder.kind !== 'pokedex' && binder.kind !== 'wishlist') return []
  const includeOwned = Boolean(options?.includeOwned)
  return listPokedexSlots(binder)
    .filter((slot) => includeOwned || !isPokedexOwned(slot, binder.kind))
    .map((slot) => slot.dexId)
}

/** Pack dex IDs into pages of `perPage` slots (null padding on the last page). */
export function packPlaceholderPages(
  dexIds: number[],
  perPage: number = PLACEHOLDER_PER_PAGE,
): (number | null)[][] {
  if (dexIds.length === 0) return []
  const pages: (number | null)[][] = []
  for (let i = 0; i < dexIds.length; i += perPage) {
    const chunk: (number | null)[] = dexIds.slice(i, i + perPage)
    while (chunk.length < perPage) chunk.push(null)
    pages.push(chunk)
  }
  return pages
}
