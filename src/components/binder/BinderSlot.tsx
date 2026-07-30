import { useEffect, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { formatPrice, getCachedCard, getCachedPrice, hydrateCard } from '../../api/prices'
import { baseCardId, parseOwnedKey } from '../../api/tcgdex'
import { slotDragId, slotDropId, type SlotDragData, type SlotDropData } from '../../lib/binderDnd'
import { CardImage } from '../CardImage'
import { useInventory } from '../../hooks/useInventory'
import { useLanguage } from '../../hooks/useLanguage'
import { getPokedexName } from '../../lib/binderUtils'
import type { Binder, BinderSettings, Slot, SlotRef } from '../../types'
import './BinderSlot.css'

type Props = {
  slotRef: SlotRef
  slot: Slot
  binder: Binder
  settings: BinderSettings
  selected?: boolean
  selectMode?: boolean
  searchHit?: boolean
  onActivate: () => void
  onSelect?: () => void
  onRemove?: () => void
  onToTray?: () => void
  onReplace?: () => void
  onPin?: () => void
  onEdit?: () => void
  onMarkMissing?: () => void
  onDetails?: () => void
}

export function BinderSlot({
  slotRef,
  slot,
  binder,
  settings,
  selected,
  selectMode,
  searchHit,
  onActivate,
  onSelect,
  onRemove,
  onToTray,
  onReplace,
  onPin,
  onEdit,
  onMarkMissing,
  onDetails,
}: Props) {
  const { lang } = useLanguage()
  const { hasCard } = useInventory()
  const [tick, setTick] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const pinned = Boolean(slot && 'pinned' in slot && slot.pinned)
  const canDrag = slot !== null && !selectMode && !pinned && binder.kind === 'custom'

  const dragData: SlotDragData = {
    kind: 'slot',
    pageIndex: slotRef.pageIndex,
    slotIndex: slotRef.slotIndex,
  }
  const dropData: SlotDropData = {
    kind: 'slot',
    pageIndex: slotRef.pageIndex,
    slotIndex: slotRef.slotIndex,
  }

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: slotDragId(slotRef),
    data: dragData,
    disabled: !canDrag,
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: slotDropId(slotRef),
    data: dropData,
    disabled: pinned,
  })

  const rawId =
    slot?.type === 'card'
      ? slot.cardId
      : slot?.type === 'pokedex'
        ? slot.topCardId
        : undefined
  const cardId = rawId ? baseCardId(rawId) : undefined

  useEffect(() => {
    if (!rawId) return
    let cancelled = false
    const { lang: keyLang } = parseOwnedKey(rawId)
    hydrateCard(keyLang ?? lang, rawId, Boolean(keyLang)).then(() => {
      if (!cancelled) setTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [rawId, lang, cardId])

  useEffect(() => {
    if (!menuOpen) return
    function onDocPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (isDragging) suppressClickRef.current = true
  }, [isDragging])

  void tick

  const cached = cardId ? getCachedCard(cardId) : undefined
  const priceObj = rawId ? getCachedPrice(rawId) ?? cached?.price : undefined
  const price = settings.showPrices ? formatPrice(priceObj, settings.priceMarket) : null
  const isMissingPokedex =
    slot?.type === 'pokedex' && !slot.topCardId && slot.ownedCardIds.length === 0

  const wishlistDim =
    binder.kind === 'wishlist' &&
    slot?.type === 'pokedex' &&
    Boolean(slot.topCardId) &&
    !hasCard(slot.topCardId!)

  const dim =
    wishlistDim ||
    (settings.dimMissing && isMissingPokedex) ||
    (settings.dimMissing && slot === null)

  const showBack =
    (settings.emptyAsCardBack && slot === null) ||
    (settings.missingAsCardBack && isMissingPokedex)

  const hasContent =
    slot !== null &&
    (slot.type === 'card' || Boolean(slot.topCardId) || slot.ownedCardIds.length > 0)

  function bindRef(node: HTMLDivElement | null) {
    rootRef.current = node
    setDragRef(node)
    setDropRef(node)
  }

  function run(action?: () => void) {
    action?.()
    setMenuOpen(false)
  }

  return (
    <div
      ref={bindRef}
      className={`b-slot ${isOver ? 'is-over' : ''} ${dim ? 'is-dim' : ''} ${
        isMissingPokedex ? 'is-missing' : ''
      } ${selected ? 'is-selected' : ''} ${searchHit ? 'is-hit' : ''} ${
        pinned ? 'is-pinned' : ''
      } ${menuOpen ? 'menu-open' : ''} ${isDragging ? 'is-dragging' : ''} ${
        canDrag ? 'is-draggable' : ''
      }`}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          return
        }
        if (selectMode) onSelect?.()
        else onActivate()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (selectMode) onSelect?.()
          else onActivate()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="b-slot-frame">
        {cached?.image || cardId ? (
          <CardImage
            src={cached?.image}
            alt={cached?.name || ''}
            quality="high"
            cardId={cardId}
            cardName={cached?.name}
            localId={cached?.localId}
            draggable={false}
          />
        ) : showBack ? (
          <span className="card-back" aria-hidden />
        ) : slot?.type === 'pokedex' ? (
          <span className="dex-placeholder">
            <strong>#{String(slot.dexId).padStart(3, '0')}</strong>
            <em>{getPokedexName(slot.dexId)}</em>
          </span>
        ) : (
          <span className="empty-mark" />
        )}

        {pinned && <span className="pin-badge">FIXA</span>}
        {price && <span className="price-tag">{price}</span>}

        {slot?.type === 'pokedex' && slot.ownedCardIds.length > 0 && (
          <span className="owned-count">{slot.ownedCardIds.length}</span>
        )}

        {isMissingPokedex && !settings.missingAsCardBack && (
          <span className="missing-badge">Falta</span>
        )}
      </span>

      {hasContent && !selectMode && (
        <>
          <button
            type="button"
            className="slot-menu-btn"
            aria-label="Ações da carta"
            aria-expanded={menuOpen}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
          >
            ⋯
          </button>
          <div
            className="hover-actions"
            role="menu"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {onDetails && (
              <button type="button" title="Detalhes" aria-label="Detalhes" onClick={() => run(onDetails)}>
                i
              </button>
            )}
            {onReplace && (
              <button
                type="button"
                title="Trocar carta"
                aria-label="Trocar carta"
                onClick={() => run(onReplace)}
              >
                ⇄
              </button>
            )}
            {onEdit && slot?.type === 'pokedex' && (
              <button type="button" title="Editar" aria-label="Editar" onClick={() => run(onEdit)}>
                ✎
              </button>
            )}
            {onPin && (
              <button
                type="button"
                title={pinned ? 'Desafixar' : 'Fixar'}
                aria-label={pinned ? 'Desafixar' : 'Fixar'}
                className={pinned ? 'active' : ''}
                onClick={() => run(onPin)}
              >
                📌
              </button>
            )}
            {onToTray && binder.kind === 'custom' && (
              <button
                type="button"
                title="Enviar à bandeja"
                aria-label="Enviar à bandeja"
                onClick={() => run(onToTray)}
              >
                ⧉
              </button>
            )}
            {onMarkMissing && (
              <button
                type="button"
                title="Marcar faltante"
                aria-label="Marcar faltante"
                onClick={() => run(onMarkMissing)}
              >
                –
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                title="Remover"
                aria-label="Remover"
                className="danger"
                onClick={() => run(onRemove)}
              >
                ×
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
