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
import { gridCols, gridRows, slotDisplayCardId } from '../../types'
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
import { BinderSlot } from './BinderSlot'
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
  const cols = gridCols(binder.grid)
  const rows = gridRows(binder.grid)
  const gridStyle = {
    ['--cols' as string]: cols,
    ['--rows' as string]: rows,
  }
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={binderCollision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className={`spread ${showTray ? 'with-tray' : ''}`}>
        <PagePanel
          page={leftPage}
          pageIndex={leftIndex}
          gridStyle={gridStyle}
          binder={binder}
          selectMode={selectMode}
          selected={selected}
          searchHits={searchHits}
          onActivate={onActivate}
          onSelect={onSelect}
          onRemove={onRemove}
          onToTray={onToTray}
          onReplace={onReplace}
          onPin={onPin}
          onEdit={onEdit}
          onMarkMissing={onMarkMissing}
          onDetails={onDetails}
          onLabelChange={onLabelChange}
          onDeletePage={onDeletePage}
        />

        {showTray && <TrayBar />}

        {rightPage ? (
          <PagePanel
            page={rightPage}
            pageIndex={rightIndex}
            gridStyle={gridStyle}
            binder={binder}
            selectMode={selectMode}
            selected={selected}
            searchHits={searchHits}
            onActivate={onActivate}
            onSelect={onSelect}
            onRemove={onRemove}
            onToTray={onToTray}
            onReplace={onReplace}
            onPin={onPin}
            onEdit={onEdit}
            onMarkMissing={onMarkMissing}
            onDetails={onDetails}
            onLabelChange={onLabelChange}
            onDeletePage={onDeletePage}
          />
        ) : (
          <section className="page-panel is-placeholder" aria-hidden>
            <div className="page-toolbar">
              <span className="page-label placeholder-label">Sem página direita</span>
            </div>
            <div className="page-grid placeholder-grid" style={gridStyle} />
          </section>
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
  )
}

function PagePanel({
  page,
  pageIndex,
  gridStyle,
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
}: {
  page: BinderPage
  pageIndex: number
  gridStyle: Record<string, number>
  binder: Binder
  selectMode?: boolean
  selected?: Set<string>
  searchHits?: Set<string>
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
}) {
  return (
    <section className="page-panel">
      <div className="page-toolbar">
        <button
          type="button"
          className="icon-btn"
          title="Limpar página"
          onClick={() => onDeletePage(pageIndex)}
          aria-label="Limpar página"
        >
          <TrashIcon />
        </button>
        <input
          className="page-label"
          value={page.label ?? ''}
          placeholder="Clique para nomear a página"
          onChange={(e) => onLabelChange(pageIndex, e.target.value)}
        />
      </div>

      <div className="page-grid" style={gridStyle}>
        {page.slots.map((slot, slotIndex) => {
          const ref = { pageIndex, slotIndex }
          const id = `p${pageIndex}-s${slotIndex}`
          return (
            <BinderSlot
              key={`${page.id}-${slotIndex}`}
              slotRef={ref}
              slot={slot}
              binder={binder}
              settings={binder.settings}
              selectMode={selectMode}
              selected={selected?.has(id)}
              searchHit={searchHits?.has(id)}
              onActivate={() => onActivate(ref)}
              onSelect={() => onSelect?.(ref)}
              onRemove={() => onRemove?.(ref)}
              onToTray={() => onToTray?.(ref)}
              onReplace={() => onReplace?.(ref)}
              onPin={() => onPin?.(ref)}
              onEdit={() => onEdit?.(ref)}
              onMarkMissing={() => onMarkMissing?.(ref)}
              onDetails={() => onDetails?.(ref)}
            />
          )
        })}
      </div>
    </section>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
