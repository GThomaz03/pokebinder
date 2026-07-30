import { useEffect, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { getCachedCard, hydrateCard } from '../../api/prices'
import { baseCardId, parseOwnedKey } from '../../api/tcgdex'
import {
  TRAY_DROP_ID,
  trayDragId,
  type TrayDragData,
  type TrayDropData,
} from '../../lib/binderDnd'
import { CardImage } from '../CardImage'
import { useLanguage } from '../../hooks/useLanguage'
import { useTray } from '../../hooks/useTray'
import { slotDisplayCardId } from '../../types'
import './TrayBar.css'

export function TrayBar() {
  const { items, clear, removeItem } = useTray()
  const dropData: TrayDropData = { kind: 'tray' }
  const { setNodeRef, isOver } = useDroppable({
    id: TRAY_DROP_ID,
    data: dropData,
  })

  return (
    <aside
      className={`tray-bar ${isOver ? 'over' : ''} ${items.length ? 'has-items' : ''}`}
      ref={setNodeRef}
      aria-label="Bandeja temporária"
    >
      <div className="tray-head">
        <strong>Bandeja</strong>
        <span className="tray-count">{items.length}</span>
        {items.length > 0 && (
          <button
            type="button"
            className="clear"
            onClick={() => {
              if (window.confirm('Limpar toda a bandeja?')) clear()
            }}
          >
            Limpar
          </button>
        )}
      </div>
      <div className="tray-items">
        {items.length === 0 && (
          <p className="hint">Solte cartas aqui para mover entre páginas.</p>
        )}
        {items.map((item) => (
          <TrayThumb
            key={item.id}
            itemId={item.id}
            cardKey={slotDisplayCardId(item.slot)}
            onRemove={() => removeItem(item.id)}
          />
        ))}
      </div>
    </aside>
  )
}

function TrayThumb({
  itemId,
  cardKey,
  onRemove,
}: {
  itemId: string
  cardKey?: string
  onRemove: () => void
}) {
  const { lang } = useLanguage()
  const [tick, setTick] = useState(0)
  const dragData: TrayDragData = { kind: 'tray', itemId }
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: trayDragId(itemId),
    data: dragData,
  })

  useEffect(() => {
    if (!cardKey) return
    let cancelled = false
    const { lang: keyLang } = parseOwnedKey(cardKey)
    hydrateCard(keyLang ?? lang, cardKey, Boolean(keyLang)).then(() => {
      if (!cancelled) setTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [cardKey, lang])

  void tick

  const cached = cardKey ? getCachedCard(baseCardId(cardKey)) : undefined
  const name = cached?.name ?? 'Carta na bandeja'

  return (
    <div
      ref={setNodeRef}
      className={`tray-thumb ${isDragging ? 'dragging' : ''}`}
      title={`${name} — arraste para um slot`}
      {...listeners}
      {...attributes}
    >
      <CardImage
        src={cached?.image}
        alt={name}
        quality="low"
        cardId={cardKey ? baseCardId(cardKey) : undefined}
        cardName={cached?.name}
        localId={cached?.localId}
        draggable={false}
      />
      <button
        type="button"
        className="x"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Remover da bandeja"
      >
        ×
      </button>
    </div>
  )
}
