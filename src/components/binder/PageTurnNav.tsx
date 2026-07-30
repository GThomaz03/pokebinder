import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './PageTurnNav.css'

type Props = {
  canPrev: boolean
  canNext: boolean
  label: string
  /** Desktop edge handles that drag to flip like a book. */
  showEdgeHandles?: boolean
  /** Compact bar between binder pages and tray (mobile). */
  showMobileBar?: boolean
  onPrev: () => void
  onNext: () => void
  onFlipProgress?: (dir: 'prev' | 'next' | null, progress: number) => void
}

const FLIP_THRESHOLD = 0.28
const CLICK_SLOP = 8

export function PageTurnNav({
  canPrev,
  canNext,
  label,
  showEdgeHandles = true,
  showMobileBar = true,
  onPrev,
  onNext,
  onFlipProgress,
}: Props) {
  const dragRef = useRef<{
    dir: 'prev' | 'next'
    startX: number
    width: number
    moved: boolean
  } | null>(null)
  const [dragging, setDragging] = useState<'prev' | 'next' | null>(null)

  function finishDrag(commit: boolean) {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(null)
    if (!drag) {
      onFlipProgress?.(null, 0)
      return
    }
    if (commit) {
      if (drag.dir === 'next') onNext()
      else onPrev()
      return
    }
    onFlipProgress?.(null, 0)
  }

  function onHandlePointerDown(dir: 'prev' | 'next', e: ReactPointerEvent<HTMLButtonElement>) {
    if (dir === 'prev' && !canPrev) return
    if (dir === 'next' && !canNext) return
    e.preventDefault()
    e.stopPropagation()
    const width = Math.max(
      160,
      e.currentTarget.closest('.spread-host, .shared-spread-host')?.clientWidth ?? 320,
    )
    dragRef.current = { dir, startX: e.clientX, width, moved: false }
    setDragging(dir)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onHandlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > CLICK_SLOP) drag.moved = true
    const raw =
      drag.dir === 'next'
        ? Math.max(0, Math.min(1, -dx / (drag.width * 0.45)))
        : Math.max(0, Math.min(1, dx / (drag.width * 0.45)))
    onFlipProgress?.(drag.dir, raw)
  }

  function onHandlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    const dx = e.clientX - drag.startX
    const progress =
      drag.dir === 'next'
        ? Math.max(0, Math.min(1, -dx / (drag.width * 0.45)))
        : Math.max(0, Math.min(1, dx / (drag.width * 0.45)))

    if (!drag.moved) {
      finishDrag(true)
      return
    }
    finishDrag(progress >= FLIP_THRESHOLD)
  }

  function onHandlePointerCancel() {
    finishDrag(false)
  }

  return (
    <>
      {showEdgeHandles && (
        <>
          <button
            type="button"
            className={`page-flip-handle page-flip-handle--prev ${dragging === 'prev' ? 'is-dragging' : ''}`}
            disabled={!canPrev}
            aria-label="Página anterior (arraste para virar)"
            title="Segure e arraste para virar · ou clique"
            onPointerDown={(e) => onHandlePointerDown('prev', e)}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerCancel}
          >
            <span className="page-flip-handle__icon" aria-hidden>
              ‹
            </span>
          </button>
          <button
            type="button"
            className={`page-flip-handle page-flip-handle--next ${dragging === 'next' ? 'is-dragging' : ''}`}
            disabled={!canNext}
            aria-label="Próxima página (arraste para virar)"
            title="Segure e arraste para virar · ou clique · cria páginas no fim"
            onPointerDown={(e) => onHandlePointerDown('next', e)}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerCancel}
          >
            <span className="page-flip-handle__icon" aria-hidden>
              ›
            </span>
          </button>
        </>
      )}

      {showMobileBar && (
        <div className="page-turn-mobile" role="navigation" aria-label="Mudar página">
          <button
            type="button"
            className="page-turn-mobile__btn"
            disabled={!canPrev}
            onClick={onPrev}
            aria-label="Página anterior"
          >
            ‹ Anterior
          </button>
          <span className="page-turn-mobile__label" aria-live="polite">
            {label}
          </span>
          <button
            type="button"
            className="page-turn-mobile__btn"
            disabled={!canNext}
            onClick={onNext}
            aria-label="Próxima página"
          >
            Próxima ›
          </button>
        </div>
      )}
    </>
  )
}
