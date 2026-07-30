import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import type { SlotRef } from '../types'

export const TRAY_DROP_ID = 'drop:tray' as const

export type SlotDragData = {
  kind: 'slot'
  pageIndex: number
  slotIndex: number
}

export type TrayDragData = {
  kind: 'tray'
  itemId: string
}

export type SlotDropData = {
  kind: 'slot'
  pageIndex: number
  slotIndex: number
}

export type TrayDropData = {
  kind: 'tray'
}

export type BinderDragData = SlotDragData | TrayDragData
export type BinderDropData = SlotDropData | TrayDropData

export function slotDragId(ref: SlotRef): string {
  return `drag:slot:${ref.pageIndex}:${ref.slotIndex}`
}

export function slotDropId(ref: SlotRef): string {
  return `drop:slot:${ref.pageIndex}:${ref.slotIndex}`
}

export function trayDragId(itemId: string): string {
  return `drag:tray:${itemId}`
}

export function parseSlotDragId(id: UniqueIdentifier): SlotRef | null {
  const m = /^drag:slot:(\d+):(\d+)$/.exec(String(id))
  if (!m) return null
  return { pageIndex: Number(m[1]), slotIndex: Number(m[2]) }
}

export function parseTrayDragId(id: UniqueIdentifier): string | null {
  const m = /^drag:tray:(.+)$/.exec(String(id))
  return m ? m[1] : null
}

export function parseSlotDropId(id: UniqueIdentifier): SlotRef | null {
  const m = /^drop:slot:(\d+):(\d+)$/.exec(String(id))
  if (!m) return null
  return { pageIndex: Number(m[1]), slotIndex: Number(m[2]) }
}

/** Prefer tray when the pointer is over it; never collide with the active drag source. */
export const binderCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id)
  const containers = args.droppableContainers.filter((c) => {
    const id = String(c.id)
    // Active drag ids are never droppables, but be safe.
    if (id === activeId) return false
    // Don't drop a slot onto its own drop target (no-op).
    if (activeId.startsWith('drag:slot:')) {
      const from = parseSlotDragId(activeId)
      const to = parseSlotDropId(id)
      if (
        from &&
        to &&
        from.pageIndex === to.pageIndex &&
        from.slotIndex === to.slotIndex
      ) {
        return false
      }
    }
    return true
  })

  const scoped = { ...args, droppableContainers: containers }

  const pointerHits = pointerWithin(scoped)
  const trayByPointer = pointerHits.find((c) => c.id === TRAY_DROP_ID)
  if (trayByPointer) return [trayByPointer]

  const rectHits = rectIntersection(scoped)
  const trayByRect = rectHits.find((c) => c.id === TRAY_DROP_ID)
  if (trayByRect) return [trayByRect]

  if (pointerHits.length > 0) return pointerHits
  if (rectHits.length > 0) return rectHits
  return closestCenter(scoped)
}
