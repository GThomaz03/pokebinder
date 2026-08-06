import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getPokedexName, listPokedexSlots } from '../../lib/binderUtils'
import type { Binder, PokedexSlot } from '../../types'
import { DexSprite } from './DexSprite'
import './PokedexReorderModal.css'

type DraftItem = {
  /** Stable id for dnd-kit (index at open time + dexId). */
  key: string
  dexId: number
  slot: PokedexSlot
}

type Props = {
  open: boolean
  binder: Binder
  onClose: () => void
  onSave: (orderedDexIds: number[]) => void
}

export function PokedexReorderModal({ open, binder, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<DraftItem[]>([])

  useEffect(() => {
    if (!open) return
    const slots = listPokedexSlots(binder)
    setDraft(
      slots.map((slot, i) => ({
        key: `${i}-${slot.dexId}`,
        dexId: slot.dexId,
        slot,
      })),
    )
  }, [open, binder])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const ids = useMemo(() => draft.map((d) => d.key), [draft])

  if (!open) return null

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDraft((prev) => {
      const oldIndex = prev.findIndex((d) => d.key === active.id)
      const newIndex = prev.findIndex((d) => d.key === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function handleSave() {
    onSave(draft.map((d) => d.dexId))
    onClose()
  }

  const title = binder.kind === 'wishlist' ? 'Reorganizar desejada' : 'Reorganizar Pokédex'

  return (
    <div className="pokedex-reorder-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pokedex-reorder-modal"
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pokedex-reorder-head">
          <div>
            <h2>{title}</h2>
            <p>
              Segure e arraste para mudar a ordem. Ao salvar, os slots do fichário seguem essa
              sequência.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <ul className="pokedex-reorder-grid">
              {draft.map((item, index) => (
                <SortableDexItem
                  key={item.key}
                  id={item.key}
                  index={index}
                  dexId={item.dexId}
                  owned={item.slot.ownedCardIds.length > 0 || Boolean(item.slot.topCardId)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <footer className="pokedex-reorder-foot">
          <span className="pokedex-reorder-count">{draft.length} espécies</span>
          <div className="pokedex-reorder-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn primary" onClick={handleSave}>
              Salvar ordem
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function SortableDexItem({
  id,
  index,
  dexId,
  owned,
}: {
  id: string
  index: number
  dexId: number
  owned: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const name = getPokedexName(dexId)

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`pokedex-reorder-item${isDragging ? ' is-dragging' : ''}${owned ? ' is-owned' : ''}`}
    >
      <button
        type="button"
        className="pokedex-reorder-handle"
        aria-label={`Arrastar ${name}`}
        {...attributes}
        {...listeners}
      >
        <span className="pokedex-reorder-art">
          <DexSprite dexId={dexId} alt="" />
        </span>
        <span className="pokedex-reorder-meta">
          <em>#{String(index + 1).padStart(3, '0')}</em>
          <strong title={name}>{name}</strong>
        </span>
      </button>
    </li>
  )
}
