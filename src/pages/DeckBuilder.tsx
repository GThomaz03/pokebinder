import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CardImage } from '../components/CardImage'
import {
  fetchDeckCardMetaRepo as fetchDeckCardMeta,
  searchCardsAdvancedRepo as searchCardsAdvanced,
  type DeckSearchHit,
} from '../api/cards/cardRepository'
import { seedCardBrief } from '../api/prices'
import { useDecks } from '../hooks/useDecks'
import { useInventory } from '../hooks/useInventory'
import { useLanguage } from '../hooks/useLanguage'
import { sortedDeckCards } from '../lib/deckRules'
import { ENERGY_TYPES, type DeckEntry } from '../types'
import './DeckBuilder.css'

const PAGE_SIZE = 48

const CATEGORIES = [
  { value: '', label: 'Todas' },
  { value: 'Pokemon', label: 'Pokémon' },
  { value: 'Trainer', label: 'Treinador' },
  { value: 'Energy', label: 'Energia' },
] as const

const TYPE_COLORS: Record<string, string> = {
  Grass: '#3d9b4a',
  Fire: '#e05a2b',
  Water: '#3b82c4',
  Lightning: '#e6b422',
  Psychic: '#a8559f',
  Fighting: '#c47a3a',
  Darkness: '#5b6578',
  Metal: '#8b9bb4',
  Fairy: '#e891c2',
  Dragon: '#7c6a3a',
  Colorless: '#a8b0bc',
}

type OwnFilter = 'all' | 'owned' | 'missing'

function matchesOwnFilter(
  cardId: string,
  ownFilter: OwnFilter,
  hasCard: (id: string) => boolean,
) {
  if (ownFilter === 'owned') return hasCard(cardId)
  if (ownFilter === 'missing') return !hasCard(cardId)
  return true
}

export function DeckBuilderPage() {
  const { id = '' } = useParams()
  const { lang } = useLanguage()
  const { getDeck, addCard, setCardQty, removeCard, clearDeck, renameDeck, updateNotes, validate } =
    useDecks()
  const { getQty, hasCard } = useInventory()

  const deck = getDeck(id)
  const validation = validate(id)

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [category, setCategory] = useState<'' | 'Pokemon' | 'Trainer' | 'Energy'>('')
  const [energyType, setEnergyType] = useState('')
  const [ownFilter, setOwnFilter] = useState<OwnFilter>('all')
  const [results, setResults] = useState<DeckSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)

  useEffect(() => {
    if (deck) {
      setNotes(deck.notes ?? '')
      setNameDraft(deck.name)
    }
  }, [deck?.id, deck?.name, deck?.notes])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    setPage(1)
    setResults([])
    setHasMore(true)
  }, [debouncedQuery, category, energyType, lang])

  useEffect(() => {
    let cancelled = false
    loadingRef.current = true
    setLoading(true)
    setError(null)

    searchCardsAdvanced(lang, {
      name: debouncedQuery || undefined,
      category: category || undefined,
      type: energyType || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((hits) => {
        if (cancelled) return
        setResults((prev) => {
          if (page === 1) return hits
          const seen = new Set(prev.map((c) => c.id))
          return [...prev, ...hits.filter((h) => !seen.has(h.id))]
        })
        setHasMore(hits.length >= PAGE_SIZE)
        if (page === 1 && hits.length === 0) {
          setError('Nenhuma carta encontrada com esses filtros.')
        }
      })
      .catch(() => {
        if (cancelled) return
        if (page === 1) setResults([])
        setHasMore(false)
        setError('Falha na busca. Verifique a conexão e tente de novo.')
      })
      .finally(() => {
        if (!cancelled) {
          loadingRef.current = false
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, category, energyType, lang, page])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting)
        if (!hit || !hasMore || loadingRef.current) return
        setPage((p) => p + 1)
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [hasMore, debouncedQuery, category, energyType, lang])

  const visibleCount = useMemo(
    () => results.filter((c) => matchesOwnFilter(c.id, ownFilter, hasCard)).length,
    [results, ownFilter, hasCard],
  )

  const list = useMemo(() => (deck ? sortedDeckCards(deck.cards) : []), [deck])

  async function onAdd(card: DeckSearchHit) {
    if (!deck) return
    setBusyId(card.id)
    try {
      seedCardBrief(card)
      const meta = await fetchDeckCardMeta(lang, card.id)
      const entry: Omit<DeckEntry, 'qty'> = {
        cardId: card.id,
        name: meta?.name ?? card.name,
        category: meta?.category ?? 'Pokemon',
        types: meta?.types,
        stage: meta?.stage,
        rarity: meta?.rarity,
        setId: meta?.setId,
        setName: meta?.setName,
        localId: meta?.localId ?? String(card.localId),
        image: meta?.image ?? card.image,
        regulationMark: meta?.regulationMark,
        trainerType: meta?.trainerType,
        energyType: meta?.energyType,
        isBasicEnergy: meta?.isBasicEnergy,
        isAceSpec: meta?.isAceSpec,
        isRadiant: meta?.isRadiant,
      }

      if (entry.isRadiant) {
        const radiantQty = deck.cards
          .filter((c) => c.isRadiant)
          .reduce((s, c) => s + c.qty, 0)
        if (radiantQty >= 1) {
          setError('Só é permitido 1 Pokémon Radiant / Radiante no deck.')
          return
        }
      }
      if (entry.isAceSpec) {
        const aceQty = deck.cards
          .filter((c) => c.isAceSpec)
          .reduce((s, c) => s + c.qty, 0)
        if (aceQty >= 1) {
          setError('Só é permitido 1 carta ACE SPEC no deck.')
          return
        }
      }

      const room = 60 - deck.cards.reduce((s, c) => s + c.qty, 0)
      if (room <= 0) {
        setError('O deck já tem 60 cartas.')
        return
      }

      const ok = addCard(deck.id, entry, 1)
      if (!ok) setError(`Limite de cópias atingido para “${entry.name}”.`)
      else setError(null)
    } finally {
      setBusyId(null)
    }
  }

  if (!deck || !validation) {
    return (
      <div className="deck-missing">
        <p>Deck não encontrado.</p>
        <Link to="/decks">Voltar aos decks</Link>
      </div>
    )
  }

  return (
    <div className="deck-builder">
      <header className="db-top">
        <Link to="/decks" className="back">
          ← Decks
        </Link>
        {editingName ? (
          <form
            className="name-edit"
            onSubmit={(e) => {
              e.preventDefault()
              renameDeck(deck.id, nameDraft)
              setEditingName(false)
            }}
          >
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
              onBlur={() => {
                renameDeck(deck.id, nameDraft)
                setEditingName(false)
              }}
            />
          </form>
        ) : (
          <button type="button" className="title-btn" onClick={() => setEditingName(true)}>
            <h1>{deck.name}</h1>
          </button>
        )}
        <div className="db-top-stats">
          <span className={`stat ${validation.complete ? 'ok' : ''}`}>
            {validation.total}
            <small>/60</small>
          </span>
          <span className={`stat ${validation.legal ? 'ok' : 'bad'}`}>
            {validation.legal ? 'Regras OK' : 'Inválido'}
          </span>
        </div>
      </header>

      <section className="db-status" aria-label="Validação do deck">
        <div className="status-meters">
          <Meter label="Pokémon" value={validation.pokemon} tone="poke" />
          <Meter label="Treinadores" value={validation.trainer} tone="train" />
          <Meter label="Energias" value={validation.energy} tone="energy" />
          <Meter
            label="Tenho"
            value={validation.ownedNeeded}
            max={validation.total || 1}
            tone="own"
            suffix={` / ${validation.total}`}
          />
        </div>
        <ul className="issue-list">
          {validation.issues.length === 0 ? (
            <li className="ok">Deck completo e dentro das regras básicas do TCG.</li>
          ) : (
            validation.issues.map((issue) => (
              <li key={issue.code + issue.message} className={issue.severity}>
                {issue.message}
              </li>
            ))
          )}
        </ul>
      </section>

      <div className="db-layout">
        <div className="db-main">
          <section className="db-filters" aria-label="Filtros de busca">
            <div className="search-form">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Digite para filtrar (ex.: Charizard, Professor…)"
                aria-label="Nome da carta"
              />
              {loading && <span className="search-live">Filtrando…</span>}
            </div>

            <div className="filter-block">
              <p className="filter-label">Categoria</p>
              <div className="chip-row">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value || 'all'}
                    type="button"
                    className={category === c.value ? 'chip active' : 'chip'}
                    onClick={() => setCategory(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-block">
              <p className="filter-label">Tipo</p>
              <div className="chip-row types">
                <button
                  type="button"
                  className={!energyType ? 'chip active' : 'chip'}
                  onClick={() => setEnergyType('')}
                >
                  Qualquer
                </button>
                {ENERGY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={energyType === t ? 'chip active' : 'chip'}
                    style={{ ['--type' as string]: TYPE_COLORS[t] }}
                    onClick={() => setEnergyType(t)}
                  >
                    <i className="type-dot" />
                    {typeLabelPt(t)}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-block">
              <p className="filter-label">Repositório</p>
              <div className="chip-row">
                {(
                  [
                    ['all', 'Todas'],
                    ['owned', 'Que eu tenho'],
                    ['missing', 'Que eu não tenho'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={ownFilter === k ? 'chip active' : 'chip'}
                    onClick={() => setOwnFilter(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="db-results" aria-label="Cartas encontradas">
            <div className="results-head">
              <h2>Cartas</h2>
              <span>
                {loading && results.length === 0
                  ? 'Carregando…'
                  : `${visibleCount} na grade${hasMore ? ' · role para mais' : ''}`}
              </span>
            </div>

            {error && results.length === 0 && <p className="search-error">{error}</p>}

            <div className="result-grid">
              {results
                .filter((card) => matchesOwnFilter(card.id, ownFilter, hasCard))
                .map((card) => {
                  const owned = getQty(card.id)
                  const inDeck = deck.cards.find((c) => c.cardId === card.id)?.qty ?? 0
                  return (
                    <article
                      key={card.id}
                      className={`result-card is-in ${owned > 0 ? 'owned' : 'missing'}`}
                    >
                      <div className="thumb">
                        <CardImage
                          src={card.image}
                          alt={card.name}
                          quality="low"
                          cardId={card.id}
                          localId={card.localId}
                          cardName={card.name}
                          energyType={card.energyType}
                        />
                        <span className={`own-badge ${owned > 0 ? 'yes' : 'no'}`}>
                          {owned > 0 ? `Tenho ×${owned}` : 'Não tenho'}
                        </span>
                      </div>
                      <div className="info">
                        <strong>{card.name}</strong>
                        <span>#{card.localId}</span>
                        {inDeck > 0 && <em>No deck: {inDeck}</em>}
                      </div>
                      <button
                        type="button"
                        className="add-btn"
                        disabled={busyId === card.id}
                        onClick={() => onAdd(card)}
                      >
                        {busyId === card.id ? '…' : '+ Adicionar'}
                      </button>
                    </article>
                  )
                })}
            </div>

            <div ref={sentinelRef} className="scroll-sentinel" aria-hidden />
            {loading && results.length > 0 && (
              <p className="scroll-loading">Carregando mais cartas…</p>
            )}
            {!hasMore && results.length > 0 && (
              <p className="scroll-end">Fim dos resultados</p>
            )}
          </section>
        </div>

        <aside className="db-list" aria-label="Deck em cartas">
          <div className="list-head">
            <h2>Seu deck ({validation.total}/60)</h2>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (window.confirm('Limpar todas as cartas deste deck?')) clearDeck(deck.id)
              }}
            >
              Limpar
            </button>
          </div>

          <label className="notes">
            Notas
            <textarea
              value={notes}
              rows={2}
              placeholder="Arquétipo, estratégia, formato…"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => updateNotes(deck.id, notes)}
            />
          </label>

          <div className="deck-sections">
            {(['Pokemon', 'Trainer', 'Energy'] as const).map((cat) => {
              const cards = list.filter((c) => c.category === cat)
              if (cards.length === 0) return null
              return (
                <div key={cat} className="deck-section">
                  <h3>
                    {cat === 'Pokemon' ? 'Pokémon' : cat === 'Trainer' ? 'Treinadores' : 'Energias'}
                    <span>{cards.reduce((s, c) => s + c.qty, 0)}</span>
                  </h3>
                  <div className="deck-card-grid">
                    {cards.map((card) => {
                      const owned = getQty(card.cardId)
                      const short = Math.max(0, card.qty - owned)
                      return (
                        <article
                          key={card.cardId}
                          className={`deck-tile ${short > 0 ? 'is-short' : 'is-ok'}`}
                        >
                          <div className="deck-tile-art">
                            <CardImage
                              src={card.image}
                              alt={card.name}
                              quality="high"
                              cardId={card.cardId}
                              localId={card.localId}
                              cardName={card.name}
                              energyType={card.energyType}
                            />
                            <span className="qty-badge">{card.qty}×</span>
                            <span className={`own-tag ${short > 0 ? 'miss' : 'ok'}`}>
                              {short > 0 ? `Faltam ${short}` : 'Tenho'}
                            </span>
                          </div>
                          <div className="deck-tile-meta">
                            <strong>{card.name}</strong>
                            <span>
                              {card.setName ?? '—'}
                              {card.isBasicEnergy ? ' · Básica' : ''}
                              {card.isRadiant ? ' · Radiant' : ''}
                              {card.isAceSpec ? ' · ACE SPEC' : ''}
                            </span>
                          </div>
                          <div className="deck-tile-ctrl">
                            <button
                              type="button"
                              aria-label="Diminuir"
                              onClick={() => setCardQty(deck.id, card, card.qty - 1)}
                            >
                              −
                            </button>
                            <button
                              type="button"
                              aria-label="Aumentar"
                              onClick={() => setCardQty(deck.id, card, card.qty + 1)}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className="x"
                              aria-label="Remover"
                              onClick={() => removeCard(deck.id, card.cardId)}
                            >
                              ×
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {list.length === 0 && (
              <p className="empty-list">
                Adicione cartas da grade ao lado — elas aparecem aqui como fichas.
              </p>
            )}
          </div>

          <div className="rules-help">
            <h3>Regras aplicadas</h3>
            <ul>
              <li>Exatamente 60 cartas</li>
              <li>Máx. 4 cópias do mesmo nome (exceto Energia Básica)</li>
              <li>Pelo menos 1 Pokémon Básico</li>
              <li>Máx. 1 Pokémon Radiant / Radiante</li>
              <li>Máx. 1 carta ACE SPEC</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Meter({
  label,
  value,
  max = 60,
  tone,
  suffix,
}: {
  label: string
  value: number
  max?: number
  tone: string
  suffix?: string
}) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className={`meter ${tone}`}>
      <div className="meter-top">
        <span>{label}</span>
        <strong>
          {value}
          {suffix ?? ''}
        </strong>
      </div>
      <div className="meter-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function typeLabelPt(t: string): string {
  const map: Record<string, string> = {
    Grass: 'Planta',
    Fire: 'Fogo',
    Water: 'Água',
    Lightning: 'Elétrico',
    Psychic: 'Psíquico',
    Fighting: 'Lutador',
    Darkness: 'Sombrio',
    Metal: 'Metal',
    Fairy: 'Fada',
    Dragon: 'Dragão',
    Colorless: 'Incolor',
  }
  return map[t] ?? t
}
