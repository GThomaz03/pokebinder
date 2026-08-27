import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  ESTIMATED_BRL_HINT,
  formatPrice,
  getCachedCard,
  getCachedPrice,
} from '../../api/prices'
import { baseCardId, parseOwnedKey } from '../../api/tcgdex'
import { slotDragId, slotDropId, type SlotDragData, type SlotDropData } from '../../lib/binderDnd'
import { CardImage } from '../CardImage'
import { useCard, useFxRates } from '../../hooks/useCardQueries'
import { useLanguage } from '../../hooks/useLanguage'
import { getPokedexName, isPokedexOwned } from '../../lib/binderUtils'
import {
  ownerTipPlacement,
  type OwnerTipPlacement,
} from '../../lib/collabColors'
import {
  gridCols,
  gridRows,
  type Binder,
  type BinderSettings,
  type Slot,
  type SlotRef,
} from '../../types'
import './BinderSlot.css'

type Props = {
  slotRef: SlotRef
  slot: Slot
  binder: Binder
  settings: BinderSettings
  selected?: boolean
  selectMode?: boolean
  searchHit?: boolean
  /** Collab: current user — pin unlock only for pinnedBy */
  currentUserId?: string
  /** Collab: member display names for pin tooltip */
  memberNames?: Record<string, string>
  /** Collab: show ownership border color */
  ownerColor?: string | null
  /** Collab: owner display name when “ver dono” is on for this placedBy */
  ownerName?: string | null
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

type TipBox = {
  placement: OwnerTipPlacement
  top: number
  left: number
}

function tipStyle(box: TipBox, color: string): CSSProperties {
  const base: CSSProperties = {
    position: 'fixed',
    top: box.top,
    left: box.left,
    zIndex: 80,
    ['--owner-color' as string]: color,
  }
  switch (box.placement) {
    case 'side-left':
      return { ...base, transform: 'translate(-100%, -50%)' }
    case 'side-right':
      return { ...base, transform: 'translate(0, -50%)' }
    case 'bottom-center':
      return { ...base, transform: 'translate(-50%, 0)' }
    case 'top-center':
      return { ...base, transform: 'translate(-50%, -100%)' }
  }
}

export function BinderSlot({
  slotRef,
  slot,
  binder,
  settings,
  selected,
  selectMode,
  searchHit,
  currentUserId,
  memberNames,
  ownerColor,
  ownerName,
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
  const [tick, setTick] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [tipBox, setTipBox] = useState<TipBox | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const pinned = Boolean(slot && 'pinned' in slot && slot.pinned)
  const pinnedBy =
    slot?.type === 'card' && slot.pinnedBy ? slot.pinnedBy : undefined
  const canUnpin = Boolean(pinned && (!pinnedBy || pinnedBy === currentUserId))
  const pinLocked = Boolean(pinned && pinnedBy && currentUserId && pinnedBy !== currentUserId)
  const pinnedByLabel =
    pinnedBy && memberNames?.[pinnedBy]
      ? memberNames[pinnedBy]
      : pinnedBy
        ? 'outro membro'
        : null
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

  const showOwnerTip = Boolean(hovered && ownerName && ownerColor && !isDragging)

  function measureTip() {
    const el = rootRef.current
    if (!el || !ownerName || !ownerColor) {
      setTipBox(null)
      return
    }
    const rect = el.getBoundingClientRect()
    const cols = gridCols(binder.grid)
    const rows = gridRows(binder.grid)
    const placement = ownerTipPlacement(slotRef.slotIndex, cols, rows)
    const gap = 6
    switch (placement) {
      case 'side-left':
        setTipBox({
          placement,
          top: rect.top + rect.height / 2,
          left: rect.left - gap,
        })
        break
      case 'side-right':
        setTipBox({
          placement,
          top: rect.top + rect.height / 2,
          left: rect.right + gap,
        })
        break
      case 'bottom-center':
        setTipBox({
          placement,
          top: rect.bottom + gap,
          left: rect.left + rect.width / 2,
        })
        break
      case 'top-center':
        setTipBox({
          placement,
          top: rect.top - gap,
          left: rect.left + rect.width / 2,
        })
        break
    }
  }

  useEffect(() => {
    if (!showOwnerTip) {
      setTipBox(null)
      return
    }
    measureTip()
    function onMove() {
      measureTip()
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [showOwnerTip, ownerName, ownerColor, slotRef.slotIndex, binder.grid])

  const { lang: keyLang } = rawId ? parseOwnedKey(rawId) : { lang: undefined }
  const cardQuery = useCard(keyLang ?? lang, rawId, Boolean(rawId))
  useFxRates(settings.showPrices)

  useEffect(() => {
    if (cardQuery.dataUpdatedAt) setTick((t) => t + 1)
  }, [cardQuery.dataUpdatedAt])

  useEffect(() => {
    if (isDragging) suppressClickRef.current = true
  }, [isDragging])

  void tick

  const cached = cardId ? (cardQuery.data ?? getCachedCard(cardId)) : undefined
  const priceObj = rawId ? getCachedPrice(rawId) ?? cached?.price : undefined
  const price = settings.showPrices ? formatPrice(priceObj, settings.priceMarket) : null
  const priceTitle = price ? ESTIMATED_BRL_HINT : undefined
  const isMissingPokedex =
    slot?.type === 'pokedex' && !slot.topCardId && slot.ownedCardIds.length === 0
  const cardMarkedMissing = slot?.type === 'card' && Boolean(slot.missing)

  const speciesHasCard =
    (binder.kind === 'wishlist' || binder.kind === 'pokedex') &&
    slot?.type === 'pokedex' &&
    Boolean(slot.topCardId)

  const speciesObtained =
    speciesHasCard && slot?.type === 'pokedex' && isPokedexOwned(slot, binder.kind)

  const speciesMissing = speciesHasCard && !speciesObtained

  // Visual only — never changes obtained/missing status on the slot
  const dim =
    settings.dimMissing &&
    (speciesMissing ||
      cardMarkedMissing ||
      isMissingPokedex ||
      slot === null)

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
  }

  const ownerStyle =
    ownerColor != null
      ? ({ '--owner-color': ownerColor } as CSSProperties)
      : undefined

  return (
    <div
      ref={bindRef}
      className={`b-slot ${isOver ? 'is-over' : ''} ${dim ? 'is-dim' : ''} ${
        isMissingPokedex || cardMarkedMissing ? 'is-missing' : ''
      } ${selected ? 'is-selected' : ''} ${searchHit ? 'is-hit' : ''} ${
        pinned ? 'is-pinned' : ''
      } ${ownerColor ? 'has-owner' : ''} ${
        isDragging ? 'is-dragging' : ''
      } ${canDrag ? 'is-draggable' : ''}`}
      style={ownerStyle}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
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
            loading="eager"
            cardId={cardId}
            cardName={cached?.name}
            localId={
              cached?.localId ||
              (cardId?.includes('-') ? cardId.slice(cardId.lastIndexOf('-') + 1) : undefined)
            }
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
        {price && (
          <span className="price-tag" title={priceTitle}>
            {price}
          </span>
        )}

        {slot?.type === 'pokedex' && slot.ownedCardIds.length > 0 && (
          <span className="owned-count">{slot.ownedCardIds.length}</span>
        )}

        {cardMarkedMissing && <span className="missing-badge">Falta</span>}

        {isMissingPokedex && !settings.missingAsCardBack && (
          <span className="missing-badge">Falta</span>
        )}
      </span>

      {hasContent && !selectMode && (
        <>
          {onRemove && !pinned && (
            <button
              type="button"
              className="slot-menu-btn slot-remove-btn"
              title="Remover"
              aria-label="Remover"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
            >
              ×
            </button>
          )}
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
            {onReplace && !pinned && (
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
                title={
                  pinLocked
                    ? `Fixada por ${pinnedByLabel ?? 'outro membro'}`
                    : pinned
                      ? 'Desafixar'
                      : 'Fixar'
                }
                aria-label={
                  pinLocked
                    ? `Fixada por ${pinnedByLabel ?? 'outro membro'}`
                    : pinned
                      ? 'Desafixar'
                      : 'Fixar'
                }
                className={pinned ? 'active' : ''}
                disabled={pinLocked || (pinned && currentUserId != null && !canUnpin)}
                onClick={() => {
                  if (pinLocked || (pinned && currentUserId != null && !canUnpin)) return
                  run(onPin)
                }}
              >
                📌
              </button>
            )}
            {onToTray && binder.kind === 'custom' && !pinned && (
              <button
                type="button"
                title="Enviar à bandeja"
                aria-label="Enviar à bandeja"
                onClick={() => run(onToTray)}
              >
                ⧉
              </button>
            )}
            {onMarkMissing && slot?.type === 'card' && (
              <button
                type="button"
                title={cardMarkedMissing ? 'Desmarcar faltante' : 'Marcar faltante'}
                aria-label={cardMarkedMissing ? 'Desmarcar faltante' : 'Marcar faltante'}
                className={cardMarkedMissing ? 'active' : ''}
                onClick={() => run(onMarkMissing)}
              >
                –
              </button>
            )}
            {onMarkMissing &&
              slot?.type === 'pokedex' &&
              (binder.kind === 'wishlist' || binder.kind === 'pokedex') &&
              Boolean(slot.topCardId) && (
                <button
                  type="button"
                  title={
                    speciesObtained ? 'Marcar como faltante' : 'Marcar como obtida'
                  }
                  aria-label={
                    speciesObtained ? 'Marcar como faltante' : 'Marcar como obtida'
                  }
                  className={speciesObtained ? 'active' : ''}
                  onClick={() => run(onMarkMissing)}
                >
                  {speciesObtained ? '–' : '✓'}
                </button>
              )}
            {onMarkMissing &&
              slot?.type === 'pokedex' &&
              binder.kind === 'pokedex' &&
              !slot.topCardId && (
                <button
                  type="button"
                  title="Marcar faltante"
                  aria-label="Marcar faltante"
                  onClick={() => run(onMarkMissing)}
                >
                  –
                </button>
              )}
          </div>
        </>
      )}

      {showOwnerTip &&
        tipBox &&
        ownerName &&
        ownerColor &&
        createPortal(
          <div
            className={`owner-name-tip place-${tipBox.placement}`}
            style={tipStyle(tipBox, ownerColor)}
            role="tooltip"
          >
            <i className="owner-name-swatch" aria-hidden />
            {ownerName}
          </div>,
          document.body,
        )}
    </div>
  )
}
