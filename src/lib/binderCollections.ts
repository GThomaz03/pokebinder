import { baseCardId } from '../api/cardKeys'
import type { Binder } from '../types'

export type BinderCollectionEntry = {
  cardId: string
  pageIndex: number
  slotIndex: number
}

export type BinderCollectionGroup = {
  setId: string
  count: number
  entries: BinderCollectionEntry[]
}

function setIdFromCardKey(key: string): string | null {
  const id = baseCardId(key)
  const dash = id.lastIndexOf('-')
  return dash > 0 ? id.slice(0, dash) : null
}

function pushEntry(
  map: Map<string, BinderCollectionEntry[]>,
  cardId: string,
  pageIndex: number,
  slotIndex: number,
) {
  const setId = setIdFromCardKey(cardId)
  if (!setId) return
  const list = map.get(setId)
  const entry: BinderCollectionEntry = { cardId, pageIndex, slotIndex }
  if (list) list.push(entry)
  else map.set(setId, [entry])
}

/**
 * Group binder slots by TCG set id derived from card keys.
 * One entry per slot occurrence so jump targets stay precise.
 */
export function collectBinderSets(binder: Binder): BinderCollectionGroup[] {
  const map = new Map<string, BinderCollectionEntry[]>()

  binder.pages.forEach((page, pageIndex) => {
    page.slots.forEach((slot, slotIndex) => {
      if (!slot) return
      if (slot.type === 'card') {
        pushEntry(map, slot.cardId, pageIndex, slotIndex)
        return
      }
      if (slot.type === 'pokedex') {
        const keys =
          slot.ownedCardIds.length > 0
            ? slot.ownedCardIds
            : slot.topCardId
              ? [slot.topCardId]
              : []
        for (const key of keys) {
          pushEntry(map, key, pageIndex, slotIndex)
        }
      }
    })
  })

  return [...map.entries()]
    .map(([setId, entries]) => ({
      setId,
      count: entries.length,
      entries,
    }))
    .sort((a, b) => a.setId.localeCompare(b.setId))
}
