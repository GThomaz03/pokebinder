import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import type { Binder, BinderPage, SlotRef } from '../../types'
import { slotDisplayCardId } from '../../types'
import { getCachedCard } from '../../api/prices'
import { baseCardId } from '../../api/tcgdex'
import {
  binderCollision,
  parseSlotDragId,
  parseTrayDragId,
  type BinderDragData,
  type BinderDropData,
} from '../../lib/binderDnd'
import { CardImage } from '../CardImage'
import { useTray } from '../../hooks/useTray'
import { PagePanel, PagePlaceholder } from './PagePanel'
import { TrayBar } from './TrayBar'
import './BinderSpread.css'

type Props = {
  binder: Binder
  leftPage: BinderPage
  rightPage: BinderPage | null
  leftIndex: number
  rightIndex: number
  selectMode?: boolean
  selected?: Set<string>
  searchHits?: Set<string>
  onSwap: (from: SlotRef, to: SlotRef) => void
  onDropTrayToSlot: (trayItemId: string, to: SlotRef) => void
  onDropSlotToTray: (from: SlotRef) => void
  onActivate: (ref: SlotRef) => void
  onSelect?: (ref: SlotRef) => void
  onRemove?: (ref: SlotRef) => void
  onToTray?: (ref: SlotRef) => void
  onReplace?: (ref: SlotRef) => void
  onPin?: (ref: SlotRef) => void
  onEdit?: (ref: SlotRef) => void
  onMarkMissing?: (ref: SlotRef) => void
  onDetails?: (ref: SlotRef) => void
  onLabelChange: (pageIndex: number, label: string) => void
  onDeletePage: (pageIndex: number) => void
  showTray?: boolean
}

export function BinderSpread({
  binder,
  leftPage,
  rightPage,
  leftIndex,
  rightIndex,
  selectMode,
  selected,
  searchHits,
  onSwap,
  onDropTrayToSlot,
  onDropSlotToTray,
  onActivate,
  onSelect,
  onRemove,
  onToTray,
  onReplace,
  onPin,
  onEdit,
  onMarkMissing,
  onDetails,
  onLabelChange,
  onDeletePage,
  showTray = true,
}: Props) {
  const { peekItem } = useTray()
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const activeCardKey = useMemo(() => {
    if (!activeId) return null
    const trayId = parseTrayDragId(activeId)
    if (trayId) {
      const item = peekItem(trayId)
      return item ? slotDisplayCardId(item.slot) ?? null : null
    }
    const ref = parseSlotDragId(activeId)
    if (!ref) return null
    const page =
      ref.pageIndex === leftIndex
        ? leftPage
        : ref.pageIndex === rightIndex
          ? rightPage
          : null
    return slotDisplayCardId(page?.slots[ref.slotIndex] ?? null) ?? null
  }, [activeId, leftIndex, leftPage, peekItem, rightIndex, rightPage])

  const activeCached = activeCardKey
    ? getCachedCard(baseCardId(activeCardKey))
    : undefined

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragCancel() {
    setActiveId(null)
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const over = e.over
    if (!over) return

    const activeData = e.active.data.current as BinderDragData | undefined
    const overData = over.data.current as BinderDropData | undefined
    if (!activeData || !overData) return

    if (activeData.kind === 'slot' && overData.kind === 'tray') {
      onDropSlotToTray({
        pageIndex: activeData.pageIndex,
        slotIndex: activeData.slotIndex,
      })
      return
    }

    if (activeData.kind === 'tray' && overData.kind === 'slot') {
      onDropTrayToSlot(activeData.itemId, {
        pageIndex: overData.pageIndex,
        slotIndex: overData.slotIndex,
      })
      return
    }

    if (activeData.kind === 'slot' && overData.kind === 'slot') {
      if (
        activeData.pageIndex === overData.pageIndex &&
        activeData.slotIndex === overData.slotIndex
      ) {
        return
      }
      onSwap(
        { pageIndex: activeData.pageIndex, slotIndex: activeData.slotIndex },
        { pageIndex: overData.pageIndex, slotIndex: overData.slotIndex },
      )
    }
  }

  const pageProps = {
    binder,
    selectMode,
    selected,
    searchHits,
    onActivate,
    onSelect,
    onRemove,
    onToTray,
    onReplace,
    onPin,
    onEdit,
    onMarkMissing,
    onDetails,
    onLabelChange,
    onDeletePage,
  }

  return (
    <div className="spread-host">
      <DndContext
        sensors={sensors}
        collisionDetection={binderCollision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className={`spread ${showTray ? 'with-tray' : ''}`}>
          <PagePanel page={leftPage} pageIndex={leftIndex} {...pageProps} />

          {showTray && <TrayBar />}

          {rightPage ? (
            <PagePanel page={rightPage} pageIndex={rightIndex} {...pageProps} />
          ) : (
            <PagePlaceholder binder={binder} />
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCardKey ? (
            <div className="drag-ghost">
              <CardImage
                src={activeCached?.image}
                alt=""
                quality="low"
                cardId={baseCardId(activeCardKey)}
                cardName={activeCached?.name}
                localId={activeCached?.localId}
                draggable={false}
              />
            </div>
          ) : activeId ? (
            <div className="drag-ghost empty" />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
