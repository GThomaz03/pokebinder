import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getSetMeta,
  listSetCardsRepo,
  type SetCardBrief,
  type SetMeta,
} from '../api/cards/cardRepository'
import { baseCardId } from '../api/cardKeys'
import { CardDetailsModal } from '../components/binder/CardDetailsModal'
import { CardImage } from '../components/CardImage'
import { CardSkeletonGrid } from '../components/Skeleton'
import { useInventory } from '../hooks/useInventory'
import { useLanguage } from '../hooks/useLanguage'
import { defaultSettings } from '../types'
import './Browse.css'

export function BrowseSetPage() {
  const { setId: rawSetId } = useParams<{ setId: string }>()
  const setId = rawSetId ? decodeURIComponent(rawSetId) : ''
  const { lang } = useLanguage()
  const { entries, getQty } = useInventory()
  const [meta, setMeta] = useState<SetMeta | null>(null)
  const [cards, setCards] = useState<SetCardBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [detailsKey, setDetailsKey] = useState<string | null>(null)
  const detailsSettings = useMemo(() => defaultSettings(), [])

  useEffect(() => {
    if (!setId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void Promise.all([getSetMeta(lang, setId), listSetCardsRepo(lang, setId)])
      .then(([setMeta, setCards]) => {
        if (cancelled) return
        setMeta(setMeta)
        setCards(setCards)
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar as cartas desta coleção.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lang, setId])

  const ownedIds = useMemo(() => {
    const set = new Set<string>()
    for (const { key, qty } of entries) {
      if (qty > 0) set.add(baseCardId(key))
    }
    return set
  }, [entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cards
    return cards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.localId.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q),
    )
  }, [cards, query])

  const ownedInSet = useMemo(
    () => cards.reduce((n, c) => n + (ownedIds.has(c.id) ? 1 : 0), 0),
    [cards, ownedIds],
  )

  const title = meta?.name ?? setId
  const total = Math.max(meta?.cardCount ?? 0, cards.length)

  return (
    <div className="browse-page">
      <header className="browse-head">
        <div>
          <Link to="/pesquisa" className="back">
            ← Coleções
          </Link>
          <h1>{title}</h1>
          <p>
            {loading
              ? 'Carregando cartas…'
              : `${ownedInSet} de ${total || cards.length} no repositório`}
            {meta?.releaseDate ? ` · ${formatSetDate(meta.releaseDate)}` : ''}
          </p>
        </div>
      </header>

      <div className="browse-toolbar">
        <h2>Cartas ({filtered.length})</h2>
        <input
          type="search"
          placeholder="Buscar carta…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar carta na coleção"
        />
      </div>

      {error && <p className="browse-state">{error}</p>}
      {loading && <CardSkeletonGrid count={24} className="browse-cards-grid" />}
      {!loading && !error && filtered.length === 0 && (
        <p className="browse-state">Nenhuma carta encontrada.</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="browse-cards-grid">
          {filtered.map((card) => {
            const owned = ownedIds.has(card.id) || getQty(card.id) > 0
            return (
              <button
                key={card.id}
                type="button"
                className={`browse-card${owned ? ' is-owned' : ''}`}
                onClick={() => setDetailsKey(card.id)}
                aria-label={`${card.name}${owned ? ' (no repositório)' : ''}`}
              >
                <div className="browse-card-art">
                  {owned && <span className="browse-owned-badge">Tenho</span>}
                  <CardImage
                    src={card.image}
                    alt=""
                    quality="low"
                    cardId={card.id}
                    cardName={card.name}
                    localId={card.localId}
                  />
                </div>
                <strong title={card.name}>{card.name}</strong>
                <span>#{card.localId}</span>
              </button>
            )
          })}
        </div>
      )}

      {detailsKey && (
        <CardDetailsModal
          open
          cardKey={detailsKey}
          settings={detailsSettings}
          ownedKeys={entries.map((e) => e.key)}
          onClose={() => setDetailsKey(null)}
        />
      )}
    </div>
  )
}

function formatSetDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
