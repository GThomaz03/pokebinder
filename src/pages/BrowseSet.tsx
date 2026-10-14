import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  listAllSetsMeta,
  listSetCardsRepo,
  type SetCardBrief,
  type SetEdition,
  type SetMeta,
} from '../api/cards/cardRepository'
import { baseCardId } from '../api/cardKeys'
import { CardDetailsModal } from '../components/binder/CardDetailsModal'
import { CardImage } from '../components/CardImage'
import { CardSkeletonGrid } from '../components/Skeleton'
import { useInventory } from '../hooks/useInventory'
import { defaultSettings, type CardLang } from '../types'
import './Browse.css'

export function BrowseSetPage() {
  const { setId: rawSetId } = useParams<{ setId: string }>()
  const setId = rawSetId ? decodeURIComponent(rawSetId) : ''
  const { entries, getQty } = useInventory()
  const [meta, setMeta] = useState<SetMeta | null>(null)
  const [cards, setCards] = useState<SetCardBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [editionLang, setEditionLang] = useState<'pt' | 'en' | null>(null)
  const [detailsKey, setDetailsKey] = useState<string | null>(null)
  const detailsSettings = useMemo(() => defaultSettings(), [])
  const languageEditions = (meta?.editions ?? []).filter(
    (edition): edition is SetEdition & { lang: 'pt' | 'en' } => edition.lang === 'pt' || edition.lang === 'en',
  )
  const activeEdition =
    languageEditions.find((edition) => edition.lang === editionLang) ??
    languageEditions.find((edition) => edition.lang === 'pt') ??
    languageEditions[0]

  useEffect(() => {
    if (!setId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const groups = await listAllSetsMeta('pt')
        if (cancelled) return
        const group = groups.find(
          (item) => item.id === setId || item.editions?.some((edition) => edition.id === setId),
        ) ?? null
        setMeta(group)
        const editions = (group?.editions ?? []).filter(
          (edition) => edition.lang === 'pt' || edition.lang === 'en',
        )
        const edition = editions.find((item) => item.lang === editionLang)
          ?? editions.find((item) => item.lang === 'pt')
          ?? editions[0]
          ?? group?.editions?.[0]
        const nextLang: CardLang = edition?.lang === 'en' ? 'en' : edition?.lang === 'ja' ? 'ja' : 'pt'
        const nextCards = await listSetCardsRepo(nextLang, edition?.id ?? setId)
        if (cancelled) return
        setCards(nextCards)
      } catch {
        if (!cancelled) setError('Não foi possível carregar as cartas desta coleção.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setId, editionLang])

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
        {languageEditions.length > 1 && (
          <div className="browse-lang" role="group" aria-label="Idioma da coleção">
            {languageEditions.map((edition) => (
              <button
                key={`${edition.lang}:${edition.id}`}
                type="button"
                aria-pressed={activeEdition?.lang === edition.lang}
                onClick={() => setEditionLang(edition.lang)}
              >
                {edition.lang === 'pt' ? 'Português' : 'English'}
              </button>
            ))}
          </div>
        )}
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
