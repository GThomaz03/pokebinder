import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice, getCachedCard, hydrateCard } from '../api/prices'
import { getSetsMeta, type SetMeta } from '../api/sets'
import { baseCardId } from '../api/tcgdex'
import { AddCardsModal } from '../components/binder/AddCardsModal'
import { CardDetailsModal } from '../components/binder/CardDetailsModal'
import { CardImage } from '../components/CardImage'
import { useFxRates } from '../hooks/useCardQueries'
import { useInventory } from '../hooks/useInventory'
import { useLanguage } from '../hooks/useLanguage'
import { cardSaleBrl } from '../lib/repositoryBinder'
import { defaultSettings } from '../types'
import './Repository.css'

const PINNED_SETS_KEY = 'pokebinder-pinned-sets-v1'
const SORT_KEY = 'pokebinder-repo-sort-v1'
const COLLAPSED_COUNT = 4
const HYDRATE_BATCH = 24

type RepoSort = 'default' | 'sale-desc'

function loadSort(): RepoSort {
  try {
    return localStorage.getItem(SORT_KEY) === 'sale-desc' ? 'sale-desc' : 'default'
  } catch {
    return 'default'
  }
}

type SetRow = {
  setId: string
  owned: number
  total: number
  pct: number
  meta?: SetMeta
  pinned: boolean
}

function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_SETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function savePinned(ids: string[]) {
  localStorage.setItem(PINNED_SETS_KEY, JSON.stringify(ids))
}

export function RepositoryPage() {
  const { entries, setQty, addQty, setProgress } = useInventory()
  const { lang } = useLanguage()
  const [query, setQuery] = useState('')
  const [tick, setTick] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [detailsKey, setDetailsKey] = useState<string | null>(null)
  const [setMeta, setSetMeta] = useState<Record<string, SetMeta>>({})
  const [pinnedIds, setPinnedIds] = useState<string[]>(loadPinned)
  const [expanded, setExpanded] = useState(false)
  const [sort, setSort] = useState<RepoSort>(loadSort)
  const detailsSettings = useMemo(() => defaultSettings(), [])
  useFxRates(true)

  useEffect(() => {
    let cancelled = false
    const keys = entries.map((e) => e.key)
    void (async () => {
      for (let i = 0; i < keys.length; i += HYDRATE_BATCH) {
        if (cancelled) return
        await Promise.all(keys.slice(i, i + HYDRATE_BATCH).map((key) => hydrateCard(lang, key)))
        if (!cancelled) setTick((t) => t + 1)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [entries, lang])

  const setIds = useMemo(() => Object.keys(setProgress), [setProgress])

  useEffect(() => {
    if (!setIds.length) {
      setSetMeta({})
      return
    }
    let cancelled = false
    void getSetsMeta(lang, setIds).then((map) => {
      if (!cancelled) setSetMeta(map)
    })
    return () => {
      cancelled = true
    }
  }, [setIds, lang])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => {
      const c = getCachedCard(baseCardId(e.key))
      return (
        e.key.toLowerCase().includes(q) ||
        c?.name.toLowerCase().includes(q) ||
        c?.setName?.toLowerCase().includes(q) ||
        c?.localId.toLowerCase().includes(q)
      )
    })
  }, [entries, query])

  const displayed = useMemo(() => {
    if (sort !== 'sale-desc') return filtered
    return [...filtered].sort((a, b) => {
      const vb = cardSaleBrl(b.key) ?? -1
      const va = cardSaleBrl(a.key) ?? -1
      if (vb !== va) return vb - va
      return a.key.localeCompare(b.key)
    })
  }, [filtered, sort, tick])

  const setRows = useMemo((): SetRow[] => {
    const pinned = new Set(pinnedIds)
    const rows: SetRow[] = Object.entries(setProgress).map(([setId, prog]) => {
      const meta = setMeta[setId]
      const owned = prog.owned
      const total = Math.max(meta?.cardCount ?? 0, prog.total, owned)
      const pct = total ? Math.round((owned / total) * 100) : 0
      return {
        setId,
        owned,
        total,
        pct,
        meta,
        pinned: pinned.has(setId),
      }
    })

    rows.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (b.pct !== a.pct) return b.pct - a.pct
      if (b.owned !== a.owned) return b.owned - a.owned
      const an = a.meta?.name ?? a.setId
      const bn = b.meta?.name ?? b.setId
      return an.localeCompare(bn, 'pt-BR')
    })
    return rows
  }, [setProgress, setMeta, pinnedIds])

  const visibleRows = expanded ? setRows : setRows.slice(0, COLLAPSED_COUNT)
  const canExpand = setRows.length > COLLAPSED_COUNT

  function togglePin(setId: string) {
    setPinnedIds((prev) => {
      const next = prev.includes(setId) ? prev.filter((id) => id !== setId) : [...prev, setId]
      savePinned(next)
      return next
    })
  }

  return (
    <div className="repo-page">
      <header className="repo-head">
        <div>
          <Link to="/" className="back">
            ← Fichários
          </Link>
          <h1>Repositório de cartas</h1>
          <p>
            Quantidades que você possui. Cartas marcadas como “tenho” em fichários entram
            automaticamente com pelo menos 1.
          </p>
        </div>
      </header>

      <section className="set-progress">
        <div className="set-progress-head">
          <h2>Progresso por coleção</h2>
          {canExpand && (
            <button
              type="button"
              className="set-more-btn"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Ver menos' : 'Ver mais'}
            </button>
          )}
        </div>
        {setRows.length === 0 ? (
          <p className="muted">Ainda sem cartas no repositório.</p>
        ) : (
          <div className={`set-grid${expanded ? ' is-expanded' : ' is-collapsed'}`}>
            {visibleRows.map((row) => {
              const name = row.meta?.name ?? row.setId
              const abbr = row.meta?.abbreviation ?? row.setId.toUpperCase().slice(0, 4)
              return (
                <article key={row.setId} className={`set-card${row.pinned ? ' is-pinned' : ''}`}>
                  <header className="set-card-top">
                    <span className="set-card-code">{abbr}</span>
                    <strong className="set-card-name" title={name}>
                      {name}
                    </strong>
                    <button
                      type="button"
                      className={`set-card-pin${row.pinned ? ' active' : ''}`}
                      aria-label={row.pinned ? 'Desafixar coleção' : 'Fixar coleção'}
                      title={row.pinned ? 'Desafixar' : 'Fixar na linha'}
                      onClick={() => togglePin(row.setId)}
                    >
                      ★
                    </button>
                  </header>
                  <div className="set-card-body">
                    <div className="set-card-logo">
                      {row.meta?.logo ? (
                        <img src={row.meta.logo} alt="" loading="lazy" />
                      ) : (
                        <span className="set-card-logo-ph">{abbr}</span>
                      )}
                    </div>
                    <div className="set-card-stats">
                      {row.meta?.releaseDate && (
                        <span className="set-card-date">
                          {formatSetDate(row.meta.releaseDate)}
                        </span>
                      )}
                      <span className="set-card-frac">
                        {row.owned}/{row.total}
                      </span>
                      <span className="set-card-pct">{row.pct}%</span>
                    </div>
                  </div>
                  <div className="set-card-bar" aria-hidden>
                    <i style={{ width: `${row.pct}%` }} />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="repo-list">
        <div className="repo-list-head">
          <h2>Cartas ({filtered.length})</h2>
          <div className="repo-list-actions">
            <label className="repo-sort">
              <span className="sr-only">Ordenar cartas</span>
              <select
                value={sort}
                aria-label="Ordenar cartas"
                onChange={(e) => {
                  const next = e.target.value === 'sale-desc' ? 'sale-desc' : 'default'
                  setSort(next)
                  try {
                    localStorage.setItem(SORT_KEY, next)
                  } catch {
                    /* ignore quota */
                  }
                }}
              >
                <option value="default">Padrão</option>
                <option value="sale-desc">Maior valor de venda</option>
              </select>
            </label>
            <input
              type="search"
              placeholder="Buscar no repositório…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className="repo-add-btn"
              onClick={() => setAddOpen(true)}
              aria-label="Adicionar cartas"
              title="Adicionar cartas"
            >
              +
            </button>
          </div>
        </div>
        <div className="cards">
          {displayed.map((e) => {
            const c = getCachedCard(baseCardId(e.key))
            return (
              <article
                key={e.key}
                className="repo-card"
                role="button"
                tabIndex={0}
                aria-label={`Ver detalhes de ${c?.name ?? e.key}`}
                onClick={() => setDetailsKey(e.key)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    setDetailsKey(e.key)
                  }
                }}
              >
                <CardImage
                  src={c?.image}
                  alt={c?.name ?? ''}
                  quality="high"
                  cardId={baseCardId(e.key)}
                  cardName={c?.name}
                  localId={c?.localId}
                />
                <div>
                  <strong>{c?.name ?? e.key}</strong>
                  <span>
                    #{c?.localId ?? '—'}
                    {c?.setName ? ` · ${c.setName}` : ''}
                  </span>
                  <span className="price">
                    {c?.price ? formatPrice(c.price, 'cardmarket') : '—'}
                  </span>
                  <div className="qty" onClick={(ev) => ev.stopPropagation()}>
                    <button type="button" onClick={() => addQty(e.key, -1)}>
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={e.qty}
                      onChange={(ev) => setQty(e.key, Number(ev.target.value) || 0)}
                    />
                    <button type="button" onClick={() => addQty(e.key, 1)}>
                      +
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <AddCardsModal
        open={addOpen}
        inventoryMode
        onClose={() => setAddOpen(false)}
        onAdd={(cardIds) => {
          const counts = new Map<string, number>()
          for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1)
          for (const [id, n] of counts) addQty(id, n)
        }}
      />

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
