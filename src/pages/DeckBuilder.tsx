import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CardImage } from '../components/CardImage'
import { ResultRowSkeletonGrid } from '../components/Skeleton'
import { baseCardId } from '../api/cardKeys'
import {
  fetchDeckCardMetaRepo as fetchDeckCardMeta,
  getCardById,
  searchCardsAdvancedRepo as searchCardsAdvanced,
  type DeckSearchHit,
} from '../api/cards/cardRepository'
import { getCachedCard, hydrateCard, seedCardBrief } from '../api/prices'
import { useDecks } from '../hooks/useDecks'
import { useInventory } from '../hooks/useInventory'
import { useLanguage } from '../hooks/useLanguage'
import { deckCategory, sortedDeckCards } from '../lib/deckRules'
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

function normalizeDeckCategory(
  raw?: string,
): 'Pokemon' | 'Trainer' | 'Energy' | undefined {
  const s = String(raw ?? '')
  if (s === 'Trainer' || s === 'Treinador') return 'Trainer'
  if (s === 'Energy' || s === 'Energia') return 'Energy'
  if (s === 'Pokemon' || s === 'Pokémon') return 'Pokemon'
  return undefined
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!)
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

function matchesOwnedLocalFilters(
  hit: DeckSearchHit,
  query: string,
  category: '' | 'Pokemon' | 'Trainer' | 'Energy',
  energyType: string,
): boolean {
  if (query) {
    const q = query.toLowerCase()
    const blob = `${hit.name} ${hit.localId} ${hit.setName ?? ''} ${hit.id}`.toLowerCase()
    if (!blob.includes(q)) return false
  }
  if (category) {
    const cat = normalizeDeckCategory(hit.category)
    if (cat !== category) return false
  }
  if (energyType) {
    const types = hit.types ?? []
    const typeHit =
      types.some((t) => t === energyType) ||
      types.some((t) => typeLabelPt(t).toLowerCase() === typeLabelPt(energyType).toLowerCase())
    if (typeHit) return true
    const pt = typeLabelPt(energyType).toLowerCase()
    const blob = `${hit.name} ${hit.energyType ?? ''}`.toLowerCase()
    if (blob.includes(energyType.toLowerCase()) || blob.includes(pt)) return true
    return false
  }
  return true
}

async function loadOwnedHit(
  lang: Parameters<typeof getCardById>[0],
  cardId: string,
): Promise<DeckSearchHit> {
  const id = baseCardId(cardId)
  try {
    const card = await getCardById(lang, id)
    if (card) {
      return {
        id: card.id,
        name: card.name,
        localId: card.localId,
        image: card.image,
        category: normalizeDeckCategory(card.category) ?? card.category,
        types: card.types,
        setId: card.setId,
        setName: card.setName,
        energyType: card.energyType,
        stage: card.stage,
        rarity: card.rarity,
        trainerType: card.trainerType,
        regulationMark: card.regulationMark,
        hp: card.hp,
      }
    }
  } catch {
    /* fall through */
  }

  const cached = getCachedCard(id) ?? (await hydrateCard(lang, id))
  if (cached) {
    return {
      id: cached.id,
      name: cached.name,
      localId: cached.localId,
      image: cached.image,
      types: cached.types,
      setId: cached.setId,
      setName: cached.setName,
    }
  }

  const dash = id.lastIndexOf('-')
  return {
    id,
    name: id,
    localId: dash > 0 ? id.slice(dash + 1) : id,
  }
}

export function DeckBuilderPage() {
  const { id = '' } = useParams()
  const { lang } = useLanguage()
  const { getDeck, addCard, adjustCardQty, removeCard, clearDeck, renameDeck, updateNotes, validate } =
    useDecks()
  const { getQty, hasCard, entries } = useInventory()

  const deck = getDeck(id)
  const validation = validate(id)

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [category, setCategory] = useState<'' | 'Pokemon' | 'Trainer' | 'Energy'>('')
  const [energyType, setEnergyType] = useState('')
  const [ownFilter, setOwnFilter] = useState<OwnFilter>('all')
  const [results, setResults] = useState<DeckSearchHit[]>([])
  const [ownedCatalog, setOwnedCatalog] = useState<DeckSearchHit[]>([])
  const [ownedCatalogReady, setOwnedCatalogReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [browsePreview, setBrowsePreview] = useState<DeckSearchHit | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)

  const ownedIds = useMemo(() => {
    const seen = new Set<string>()
    const ids: string[] = []
    for (const { key, qty } of entries) {
      if (qty <= 0) continue
      const cardId = baseCardId(key)
      if (seen.has(cardId)) continue
      seen.add(cardId)
      ids.push(cardId)
    }
    ids.sort((a, b) => a.localeCompare(b))
    return ids
  }, [entries])

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

  // Load full repository catalog when "Que eu tenho" is active.
  useEffect(() => {
    if (ownFilter !== 'owned') {
      setOwnedCatalogReady(false)
      return
    }
    let cancelled = false
    setOwnedCatalogReady(false)
    setLoading(true)
    loadingRef.current = true

    void mapPool(ownedIds, 6, (cardId) => loadOwnedHit(lang, cardId))
      .then((hits) => {
        if (cancelled) return
        hits.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        setOwnedCatalog(hits)
        setOwnedCatalogReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setOwnedCatalog([])
        setOwnedCatalogReady(true)
        setError('Não foi possível carregar as cartas do repositório.')
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
  }, [ownFilter, ownedIds, lang])

  useEffect(() => {
    setPage(1)
    setResults([])
    setHasMore(true)
  }, [debouncedQuery, category, energyType, lang, ownFilter])

  useEffect(() => {
    let cancelled = false

    if (ownFilter === 'owned') {
      if (!ownedCatalogReady) return
      loadingRef.current = true
      setLoading(true)
      setError(null)

      const filtered = ownedCatalog.filter((hit) =>
        matchesOwnedLocalFilters(hit, debouncedQuery, category, energyType),
      )
      const slice = filtered.slice(0, page * PAGE_SIZE)
      if (!cancelled) {
        setResults(slice)
        setHasMore(slice.length < filtered.length)
        if (page === 1 && filtered.length === 0) {
          setError(
            ownedCatalog.length === 0
              ? 'Nenhuma carta no repositório. Adicione cartas em Repositório primeiro.'
              : 'Nenhuma carta do repositório combina com esses filtros.',
          )
        }
        loadingRef.current = false
        setLoading(false)
      }
      return () => {
        cancelled = true
      }
    }

    const hasQuery = debouncedQuery.length > 0 || category !== '' || energyType !== ''
    if (!hasQuery) {
      setResults([])
      setHasMore(false)
      setError(null)
      setLoading(false)
      loadingRef.current = false
      return
    }

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
  }, [
    debouncedQuery,
    category,
    energyType,
    lang,
    page,
    ownFilter,
    ownedCatalog,
    ownedCatalogReady,
  ])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const obs = new IntersectionObserver(
      (obsEntries) => {
        const hit = obsEntries.some((e) => e.isIntersecting)
        if (!hit || !hasMore || loadingRef.current) return
        setPage((p) => p + 1)
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [hasMore, debouncedQuery, category, energyType, lang, ownFilter])

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
        category: deckCategory(meta?.category ?? card.category),
        types: meta?.types,
        stage: meta?.stage,
        rarity: meta?.rarity,
        setId: meta?.setId,
        setName: meta?.setName,
        localId: meta?.localId ?? String(card.localId),
        image: meta?.image ?? card.image,
        regulationMark: meta?.regulationMark,
        legalStandard: meta?.legalStandard,
        legalExpanded: meta?.legalExpanded,
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
      else {
        setError(null)
        setFocusId(card.id)
        setBrowsePreview(null)
      }
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

  const focused =
    list.find((c) => c.cardId === focusId) ?? (browsePreview ? null : list[0] ?? null)
  const stage = browsePreview
    ? {
        id: browsePreview.id,
        name: browsePreview.name,
        image: browsePreview.image,
        localId: browsePreview.localId,
        setName: undefined as string | undefined,
        energyType: browsePreview.energyType,
        qty: deck.cards.find((c) => c.cardId === browsePreview.id)?.qty ?? 0,
      }
    : focused
      ? {
          id: focused.cardId,
          name: focused.name,
          image: focused.image,
          localId: focused.localId,
          setName: focused.setName,
          energyType: focused.energyType,
          qty: focused.qty,
        }
      : null

  return (
    <div className="deck-builder">
      <header className="live-bar">
        <Link to="/decks" className="live-back">
          Decks
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
              aria-label="Nome do deck"
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
        <div className="live-count" aria-label="Total de cartas">
          <strong className={validation.complete ? 'ok' : ''}>{validation.total}</strong>
          <span>/ 60</span>
        </div>
        <span className={`live-legal ${validation.legal && validation.complete ? 'ok' : 'bad'}`}>
          {validation.legal && validation.complete ? 'Legal' : 'Incompleto'}
        </span>
      </header>

      <div className="live-stage">
        <aside className="live-list" aria-label="Lista do deck">
          <div className="live-list-scroll">
            {(['Pokemon', 'Trainer', 'Energy'] as const).map((cat) => {
              const cards = list.filter((c) => (normalizeDeckCategory(c.category) ?? 'Pokemon') === cat)
              const count = cards.reduce((s, c) => s + c.qty, 0)
              const label = cat === 'Pokemon' ? 'Pokémon' : cat === 'Trainer' ? 'Treinador' : 'Energia'
              return (
                <section key={cat} className="live-section">
                  <h2>
                    {label}
                    <span>{count}</span>
                  </h2>
                  {cards.length === 0 ? (
                    <p className="live-empty-row">Nenhuma</p>
                  ) : (
                    <ul>
                      {cards.map((card) => {
                        const owned = getQty(card.cardId)
                        const short = Math.max(0, card.qty - owned)
                        const type = card.types?.[0] ?? card.energyType
                        const active = !browsePreview && stage?.id === card.cardId
                        return (
                          <li key={card.cardId}>
                            <button
                              type="button"
                              className={`live-row ${active ? 'is-on' : ''} ${short > 0 ? 'is-short' : ''}`}
                              style={{ ['--type' as string]: type ? TYPE_COLORS[type] : '#8b9bb4' }}
                              onClick={() => {
                                setBrowsePreview(null)
                                setFocusId(card.cardId)
                              }}
                            >
                              <span className="live-row-art">
                                <CardImage
                                  src={card.image}
                                  alt=""
                                  quality="low"
                                  cardId={card.cardId}
                                  localId={card.localId}
                                  cardName={card.name}
                                  energyType={
                                    (normalizeDeckCategory(card.category) ?? 'Pokemon') === 'Energy'
                                      ? card.energyType ?? type
                                      : undefined
                                  }
                                />
                              </span>
                              <span className="live-row-name">
                                {card.name}
                                {[card.setId, short > 0 ? `faltam ${short}` : null].filter(Boolean).length > 0 && (
                                  <em>
                                    {[card.setId, short > 0 ? `faltam ${short}` : null]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </em>
                                )}
                              </span>
                              <span className="live-row-qty">{card.qty}</span>
                            </button>
                            <span className="live-row-ctrl">
                              <button
                                type="button"
                                aria-label={`Diminuir ${card.name}`}
                                onClick={() => adjustCardQty(deck.id, card.cardId, -1)}
                              >
                                −
                              </button>
                              <button
                                type="button"
                                aria-label={`Aumentar ${card.name}`}
                                onClick={() => adjustCardQty(deck.id, card.cardId, 1)}
                              >
                                +
                              </button>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
          <footer className="live-list-foot">
            {validation.issues.length === 0 ? (
              <p className="ok">60 cartas, dentro das regras.</p>
            ) : (
              <ul>
                {validation.issues.slice(0, 3).map((issue) => (
                  <li key={issue.code + issue.message}>{issue.message}</li>
                ))}
              </ul>
            )}
            <div className="live-foot-actions">
              <label className="notes">
                Notas
                <textarea
                  value={notes}
                  rows={2}
                  placeholder="Arquétipo, formato…"
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => updateNotes(deck.id, notes)}
                />
              </label>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  if (window.confirm('Limpar todas as cartas deste deck?')) clearDeck(deck.id)
                }}
              >
                Limpar deck
              </button>
            </div>
          </footer>
        </aside>

        <section className="live-preview" aria-label="Carta selecionada">
          {stage ? (
            <>
              <div className="live-preview-art">
                <CardImage
                  src={stage.image}
                  alt={stage.name}
                  quality="high"
                  cardId={stage.id}
                  localId={stage.localId}
                  cardName={stage.name}
                  energyType={stage.energyType}
                />
              </div>
              <div className="live-preview-meta">
                <h2>{stage.name}</h2>
                <p>
                  {stage.setName ? `${stage.setName} · ` : ''}#{stage.localId ?? '—'}
                  {stage.qty > 0 ? ` · ${stage.qty} no deck` : ''}
                </p>
              </div>
            </>
          ) : (
            <p className="live-preview-empty">Escolha uma carta na busca para ver a arte.</p>
          )}
        </section>

        <section className="live-catalog" aria-label="Buscar cartas">
          <input
            className="live-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar carta"
            aria-label="Nome da carta"
          />
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
          <div className="type-rail" role="group" aria-label="Tipo">
            <button
              type="button"
              className={!energyType ? 'type-orb on' : 'type-orb'}
              onClick={() => setEnergyType('')}
              aria-label="Qualquer tipo"
            >
              *
            </button>
            {ENERGY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={energyType === t ? 'type-orb on' : 'type-orb'}
                style={{ ['--type' as string]: TYPE_COLORS[t] }}
                aria-label={typeLabelPt(t)}
                aria-pressed={energyType === t}
                onClick={() => setEnergyType(t)}
              />
            ))}
          </div>
          <div className="chip-row">
            {(
              [
                ['all', 'Todas'],
                ['owned', 'Tenho'],
                ['missing', 'Não tenho'],
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

          {!debouncedQuery && !category && !energyType && ownFilter === 'all' && (
            <p className="search-error">Busque pelo nome, por exemplo Dragapult, Dreepy ou Doce Raro.</p>
          )}
          {error && results.length === 0 && <p className="search-error">{error}</p>}
          {loading && results.length === 0 && !error && <ResultRowSkeletonGrid count={6} />}

          <div className="live-results">
            {results
              .filter((card) => matchesOwnFilter(card.id, ownFilter, hasCard))
              .map((card) => {
                const inDeck = deck.cards.find((c) => c.cardId === card.id)?.qty ?? 0
                return (
                  <article key={card.id} className={`live-hit ${inDeck > 0 ? 'in-deck' : ''}`}>
                    <button
                      type="button"
                      className="live-hit-art"
                      onClick={() => {
                        setBrowsePreview(card)
                        setFocusId(null)
                      }}
                      aria-label={`Ver ${card.name}`}
                    >
                      <CardImage
                        src={card.image}
                        alt={card.name}
                        quality="low"
                        cardId={card.id}
                        localId={card.localId}
                        cardName={card.name}
                        energyType={card.energyType}
                      />
                      {inDeck > 0 && <span className="hit-qty">{inDeck}</span>}
                    </button>
                      <button
                        type="button"
                        className="hit-add"
                        disabled={busyId === card.id}
                        onClick={() => onAdd(card)}
                      >
                        {busyId === card.id ? '…' : 'Adicionar'}
                      </button>
                      <span className="hit-meta">
                        {card.setId ?? '—'} · #{card.localId}
                        {card.regulationMark ? ` · ${card.regulationMark}` : ''}
                      </span>
                  </article>
                )
              })}
          </div>
          <div ref={sentinelRef} className="scroll-sentinel" aria-hidden />
          {loading && results.length > 0 && <p className="scroll-loading">Carregando…</p>}
          <p className="live-results-count">
            {loading && results.length === 0 ? 'Carregando…' : `${visibleCount} cartas`}
          </p>
        </section>
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
