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
import { useMemo, useRef, useState, type CSSProperties, type TouchEvent as ReactTouchEvent } from 'react'
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
import { PageTurnNav } from './PageTurnNav'
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
  canPrevPage: boolean
  canNextPage: boolean
  pageLabel: string
  onPrevPage: () => void
  onNextPage: () => void
}

const SWIPE_MIN_DX = 56
const SWIPE_MAX_DY_RATIO = 0.75

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
  canPrevPage,
  canNextPage,
  pageLabel,
  onPrevPage,
  onNextPage,
}: Props) {
  const { peekItem } = useTray()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [flipDir, setFlipDir] = useState<'prev' | 'next' | null>(null)
  const [flipProgress, setFlipProgress] = useState(0)
  const [turning, setTurning] = useState<'prev' | 'next' | null>(null)
  const swipeRef = useRef<{ x: number; y: number; tracking: boolean } | null>(null)
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

  function playTurn(dir: 'prev' | 'next', action: () => void) {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      action()
      return
    }
    setTurning(dir)
    setFlipDir(dir)
    setFlipProgress(1)
    window.setTimeout(() => {
      action()
      setTurning(null)
      setFlipDir(null)
      setFlipProgress(0)
    }, 280)
  }

  function handlePrev() {
    if (!canPrevPage) return
    if (flipProgress > 0.2) {
      onPrevPage()
      setFlipDir(null)
      setFlipProgress(0)
      return
    }
    playTurn('prev', onPrevPage)
  }

  function handleNext() {
    if (!canNextPage) return
    if (flipProgress > 0.2) {
      onNextPage()
      setFlipDir(null)
      setFlipProgress(0)
      return
    }
    playTurn('next', onNextPage)
  }

  function onFlipProgress(dir: 'prev' | 'next' | null, progress: number) {
    setFlipDir(dir)
    setFlipProgress(progress)
  }

  function swipeTargetBlocked(target: EventTarget | null) {
    if (!(target instanceof Element)) return true
    return Boolean(
      target.closest(
        'button, input, textarea, select, a, [data-no-page-swipe], .tray-bar, .binder-slot, [draggable="true"]',
      ),
    )
  }

  function onTouchStart(e: ReactTouchEvent) {
    if (activeId || e.touches.length !== 1) return
    if (swipeTargetBlocked(e.target)) {
      swipeRef.current = null
      return
    }
    const t = e.touches[0]
    swipeRef.current = { x: t.clientX, y: t.clientY, tracking: true }
  }

  function onTouchMove(e: ReactTouchEvent) {
    const swipe = swipeRef.current
    if (!swipe?.tracking || e.touches.length !== 1) return
    const t = e.touches[0]
    const dx = t.clientX - swipe.x
    const dy = t.clientY - swipe.y
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_DY_RATIO && Math.abs(dy) > 24) {
      swipe.tracking = false
      setFlipDir(null)
      setFlipProgress(0)
      return
    }
    if (Math.abs(dx) < 12) return
    const dir: 'prev' | 'next' = dx > 0 ? 'prev' : 'next'
    if ((dir === 'prev' && !canPrevPage) || (dir === 'next' && !canNextPage)) {
      setFlipDir(null)
      setFlipProgress(0)
      return
    }
    const width = Math.max(200, (e.currentTarget as HTMLElement).clientWidth)
    const progress = Math.max(0, Math.min(1, Math.abs(dx) / (width * 0.4)))
    setFlipDir(dir)
    setFlipProgress(progress)
  }

  function onTouchEnd(e: ReactTouchEvent) {
    const swipe = swipeRef.current
    swipeRef.current = null
    if (!swipe?.tracking) {
      setFlipDir(null)
      setFlipProgress(0)
      return
    }
    const t = e.changedTouches[0]
    const dx = t.clientX - swipe.x
    const dy = t.clientY - swipe.y
    setFlipDir(null)
    setFlipProgress(0)
    if (Math.abs(dx) < SWIPE_MIN_DX) return
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_DY_RATIO) return
    if (dx < 0) handleNext()
    else handlePrev()
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

  const spreadClass = [
    'spread',
    showTray ? 'with-tray' : '',
    flipDir ? 'is-flipping' : '',
    flipDir ? `is-flipping-${flipDir}` : '',
    turning ? `is-turning-${turning}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const spreadStyle = {
    '--flip-progress': String(flipProgress),
  } as CSSProperties

  return (
    <div
      className="spread-host"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        swipeRef.current = null
        setFlipDir(null)
        setFlipProgress(0)
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={binderCollision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className={spreadClass} style={spreadStyle}>
          <PagePanel page={leftPage} pageIndex={leftIndex} {...pageProps} />

          {showTray && <TrayBar />}

          {rightPage ? (
            <PagePanel page={rightPage} pageIndex={rightIndex} {...pageProps} />
          ) : (
            <PagePlaceholder binder={binder} />
          )}

          <PageTurnNav
            canPrev={canPrevPage}
            canNext={canNextPage}
            label={pageLabel}
            onPrev={handlePrev}
            onNext={handleNext}
            onFlipProgress={onFlipProgress}
          />
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

