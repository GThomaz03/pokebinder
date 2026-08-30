import { useEffect, useMemo, useState } from 'react'
import { fetchSpeciesVariantsRepo } from '../../api/cards/cardRepository'
import type { CardVariant } from '../../api/cards/types'
import { getLastCatalogSource } from '../../api/cards/cardRepository'
import { ESTIMATED_BRL_HINT, formatPrice, getCachedCard, seedCardBrief } from '../../api/prices'
import { CardImage } from '../CardImage'
import { CardSkeletonGrid } from '../Skeleton'
import { useLanguage } from '../../hooks/useLanguage'
import { getPokedexName } from '../../lib/binderUtils'
import type { BinderSettings, CardLang, PokedexSlot } from '../../types'
import './PokedexPanel.css'

const NATIONALITIES: { value: CardLang; short: string; label: string }[] = [
  { value: 'pt', short: 'BR', label: 'Brasil (PT)' },
  { value: 'en', short: 'EN', label: 'Inglês (EN)' },
  { value: 'ja', short: 'JP', label: 'Japão (JP)' },
]

type Props = {
  open: boolean
  slot: PokedexSlot
  settings: BinderSettings
  mode?: 'collection' | 'wishlist'
  onClose: () => void
  onChange: (patch: Partial<PokedexSlot>) => void
}

export function PokedexPanel({
  open,
  slot,
  settings,
  mode = 'collection',
  onClose,
  onChange,
}: Props) {
  const { lang: globalLang } = useLanguage()
  const [cardLang, setCardLang] = useState<CardLang>(globalLang)
  const [variants, setVariants] = useState<CardVariant[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [catalogFallback, setCatalogFallback] = useState(false)
  const speciesName = getPokedexName(slot.dexId)

  useEffect(() => {
    if (open) setCardLang(globalLang)
  }, [open, globalLang])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setQuery('')
    setVariants([])
    setCatalogFallback(false)
    fetchSpeciesVariantsRepo(cardLang, slot.dexId, speciesName)
      .then((data) => {
        if (cancelled) return
        setVariants(data)
        setCatalogFallback(getLastCatalogSource() === 'pokemontcg')
        for (const v of data) {
          seedCardBrief({
            id: v.cardId,
            name: v.name,
            localId: v.localId,
            image: v.image,
            setId: v.setId,
            setName: v.setName,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setVariants([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, slot.dexId, cardLang, speciesName])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return variants
    return variants.filter((v) => {
      const name = v.name.toLowerCase()
      const set = (v.setName ?? '').toLowerCase()
      const num = String(v.localId).toLowerCase()
      const numPad = num.replace(/^0+/, '')
      const variant = v.variantLabel.toLowerCase()
      const id = v.cardId.toLowerCase()
      return (
        name.includes(q) ||
        set.includes(q) ||
        num.includes(q) ||
        numPad.includes(q.replace(/^0+/, '')) ||
        variant.includes(q) ||
        id.includes(q)
      )
    })
  }, [variants, query])

  const isWishlist = mode === 'wishlist'
  const ownLabel = isWishlist ? 'Quero' : 'Tenho'
  const ownLabelActive = isWishlist ? 'Desejada' : 'Tenho'

  if (!open) return null

  function toggleOwned(key: string) {
    const owned = new Set(slot.ownedCardIds)
    if (owned.has(key)) {
      owned.delete(key)
      const nextOwned = [...owned]
      if (isWishlist) {
        onChange({
          ownedCardIds: nextOwned,
          topCardId: slot.topCardId === key ? undefined : slot.topCardId,
        })
      } else {
        onChange({
          ownedCardIds: nextOwned,
          topCardId: slot.topCardId,
          obtained: nextOwned.length > 0,
        })
      }
    } else {
      owned.add(key)
      if (isWishlist) {
        onChange({
          ownedCardIds: [...owned],
          topCardId: slot.topCardId ?? key,
        })
      } else {
        onChange({
          ownedCardIds: [...owned],
          topCardId: slot.topCardId ?? key,
          obtained: true,
        })
      }
    }
  }

  function setTop(key: string) {
    if (isWishlist) {
      const owned = new Set(slot.ownedCardIds)
      owned.add(key)
      onChange({ ownedCardIds: [...owned], topCardId: key })
      return
    }
    // Collection: pin desired card without forcing ownership
    const alreadyOwned = slot.ownedCardIds.includes(key)
    onChange({
      topCardId: key,
      obtained: alreadyOwned ? true : false,
    })
  }

  const natLabel = NATIONALITIES.find((n) => n.value === cardLang)?.label ?? cardLang

  return (
    <div className="dex-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dex-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Cartas de ${speciesName}${isWishlist ? ' (desejada)' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dex-modal-head">
          <div>
            <p className="dex-num">#{String(slot.dexId).padStart(3, '0')}</p>
            <h2>{speciesName}</h2>
            <p className="dex-sub">
              {loading
                ? `Carregando versões (${natLabel})…`
                : `${filtered.length} de ${variants.length} versões · ${natLabel}${
                    isWishlist
                      ? ' · lista desejada'
                      : ' · defina a carta e marque Tenho quando conseguir'
                  }`}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="dex-toolbar">
          <div className="nat-group" role="group" aria-label="Nacionalidade da carta">
            <span className="nat-label">Nacionalidade</span>
            {NATIONALITIES.map((n) => (
              <button
                key={n.value}
                type="button"
                className={`nat-btn ${cardLang === n.value ? 'active' : ''}`}
                onClick={() => setCardLang(n.value)}
                title={n.label}
                disabled={loading && cardLang === n.value}
              >
                {n.short}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="dex-search"
            placeholder="Buscar por nome, número do pacote (#025), set ou variante…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {catalogFallback && (
          <p className="dex-fallback-banner" role="status">
            Catálogo temporário: TCGdex indisponível — versões em inglês via Pokémon TCG API.
          </p>
        )}

        <div className="dex-modal-body">
          {loading && <CardSkeletonGrid count={12} />}

          {!loading && filtered.length === 0 && (
            <p className="state">
              {catalogFallback
                ? `Nenhuma carta encontrada no catálogo temporário para ${speciesName}. Tente outro termo ou aguarde o TCGdex voltar.`
                : `Nenhuma carta encontrada para ${natLabel}. Tente outra nacionalidade.`}
            </p>
          )}

          {!loading && (
          <div className="dex-grid">
            {filtered.map((card) => {
              const owned = slot.ownedCardIds.includes(card.key)
              const isTop = slot.topCardId === card.key
              const price = settings.showPrices
                ? formatPrice(getCachedCard(card.cardId)?.price, settings.priceMarket)
                : null
              return (
                <article
                  key={card.key}
                  className={`dex-tile ${owned ? 'owned' : ''} ${isTop ? 'top' : ''}`}
                >
                  <button
                    type="button"
                    className="dex-art"
                    onClick={() => toggleOwned(card.key)}
                    aria-pressed={owned}
                  >
                    {card.image ? (
                      <CardImage
                        src={card.image}
                        alt={card.name}
                        quality="high"
                        cardId={card.cardId}
                        cardName={card.name}
                        localId={card.localId}
                      />
                    ) : (
                      <div className="ph">Sem imagem</div>
                    )}
                    {isTop && <span className="top-badge">TOPO</span>}
                    <span className="nat-badge">{cardLang.toUpperCase()}</span>
                    {price && (
                      <span className="price" title={ESTIMATED_BRL_HINT}>
                        {price}
                      </span>
                    )}
                  </button>
                  <div className="dex-meta">
                    <strong>{card.name}</strong>
                    <span className="muted">
                      #{card.localId}
                      {card.setName ? ` · ${card.setName}` : ''}
                    </span>
                    <span className="variant-chip">{card.variantLabel}</span>
                    <div className="actions">
                      <button
                        type="button"
                        className={owned ? 'is-on' : ''}
                        onClick={() => toggleOwned(card.key)}
                        aria-pressed={owned}
                      >
                        {owned ? ownLabelActive : ownLabel}
                      </button>
                      <button
                        type="button"
                        className={isTop ? 'is-on' : ''}
                        onClick={() => setTop(card.key)}
                        aria-pressed={isTop}
                      >
                        {isTop ? 'No topo' : isWishlist ? 'Usar no topo' : 'Definir carta'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
