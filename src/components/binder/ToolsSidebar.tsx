import { useEffect, useMemo, useState } from 'react'
import { baseCardId } from '../../api/cardKeys'
import { getSetsMeta, type SetMeta } from '../../api/sets'
import { getCachedCard, hydrateCard } from '../../api/prices'
import { collectBinderSets } from '../../lib/binderCollections'
import { useLanguage } from '../../hooks/useLanguage'
import type { Binder, SlotRef, ToolMode } from '../../types'
import { CardImage } from '../CardImage'
import './ToolsSidebar.css'

type Props = {
  binder: Binder
  mode: ToolMode
  onMode: (mode: ToolMode) => void
  selectedCount: number
  search: string
  onSearch: (q: string) => void
  matches: { pageIndex: number; slotIndex: number; label: string }[]
  onJump: (ref: SlotRef) => void
  onReorder: (from: number, to: number) => void
  canReorder: boolean
}

export function ToolsSidebar({
  binder,
  mode,
  onMode,
  selectedCount,
  search,
  onSearch,
  matches,
  onJump,
  onReorder,
  canReorder,
}: Props) {
  const { lang } = useLanguage()
  const [activeSetId, setActiveSetId] = useState<string | null>(null)
  const [setMeta, setSetMeta] = useState<Record<string, SetMeta>>({})
  const [cardTick, setCardTick] = useState(0)

  const groups = useMemo(() => collectBinderSets(binder), [binder])
  const setIdsKey = useMemo(() => groups.map((g) => g.setId).join('|'), [groups])

  useEffect(() => {
    if (mode !== 'collections') setActiveSetId(null)
  }, [mode])

  useEffect(() => {
    if (mode !== 'collections' || !setIdsKey) {
      setSetMeta({})
      return
    }
    const ids = setIdsKey.split('|').filter(Boolean)
    let cancelled = false
    void getSetsMeta(lang, ids).then((map) => {
      if (!cancelled) setSetMeta(map)
    })
    return () => {
      cancelled = true
    }
  }, [mode, lang, setIdsKey])

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const ad = setMeta[a.setId]?.releaseDate ?? ''
      const bd = setMeta[b.setId]?.releaseDate ?? ''
      if (ad && bd) return bd.localeCompare(ad)
      if (ad) return -1
      if (bd) return 1
      const an = setMeta[a.setId]?.name ?? a.setId
      const bn = setMeta[b.setId]?.name ?? b.setId
      return an.localeCompare(bn, 'pt-BR')
    })
  }, [groups, setMeta])

  const activeGroup = activeSetId
    ? groups.find((g) => g.setId === activeSetId) ?? null
    : null

  useEffect(() => {
    if (!activeSetId || !activeGroup) return
    let cancelled = false
    const ids = [...new Set(activeGroup.entries.map((e) => baseCardId(e.cardId)))]
    void Promise.all(ids.map((id) => hydrateCard(lang, id))).then(() => {
      if (!cancelled) setCardTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate when set or entries change
  }, [activeSetId, activeGroup?.count, lang])

  void cardTick

  function setMode(next: ToolMode) {
    onMode(mode === next ? 'none' : next)
  }

  return (
    <aside className="tools-side" aria-label="Ferramentas">
      <button
        type="button"
        className={mode === 'select' ? 'active' : ''}
        onClick={() => setMode('select')}
        title="Selecionar várias"
      >
        <SelectIcon />
        <span>Selecionar</span>
        {selectedCount > 0 && <em>{selectedCount}</em>}
      </button>
      <button
        type="button"
        className={mode === 'overview' ? 'active' : ''}
        onClick={() => setMode('overview')}
        title="Visão das páginas"
      >
        <PagesIcon />
        <span>Páginas</span>
      </button>
      <button
        type="button"
        className={mode === 'collections' ? 'active' : ''}
        onClick={() => setMode('collections')}
        title="Coleções no fichário"
      >
        <CollectionsIcon />
        <span>Coleções</span>
        {groups.length > 0 && <em>{groups.length}</em>}
      </button>
      <button
        type="button"
        className={mode === 'search' ? 'active' : ''}
        onClick={() => setMode('search')}
        title="Pesquisar no fichário"
      >
        <SearchIcon />
        <span>Buscar</span>
      </button>

      {mode === 'search' && (
        <div className="tool-panel">
          <input
            type="search"
            placeholder="Nome ou número…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            autoFocus
          />
          <ul>
            {matches.slice(0, 40).map((m) => (
              <li key={`${m.pageIndex}-${m.slotIndex}`}>
                <button type="button" onClick={() => onJump(m)}>
                  {m.label}
                  <small>
                    p.{m.pageIndex + 1} · slot {m.slotIndex + 1}
                  </small>
                </button>
              </li>
            ))}
            {search && matches.length === 0 && <li className="empty">Nenhum resultado</li>}
          </ul>
        </div>
      )}

      {mode === 'overview' && (
        <div className="tool-panel overview">
          {binder.pages.map((p, i) => (
            <div key={p.id} className="page-row">
              <button type="button" className="jump" onClick={() => onJump({ pageIndex: i, slotIndex: 0 })}>
                <strong>{i + 1}</strong>
                <span>{p.label || `Página ${i + 1}`}</span>
              </button>
              {canReorder && (
                <div className="move">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => onReorder(i, i - 1)}
                    aria-label="Subir página"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={i >= binder.pages.length - 1}
                    onClick={() => onReorder(i, i + 1)}
                    aria-label="Descer página"
                  >
                    ↓
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {mode === 'collections' && (
        <div className="tool-panel collections">
          {activeGroup ? (
            <>
              <div className="collections-detail-head">
                <button
                  type="button"
                  className="collections-back"
                  onClick={() => setActiveSetId(null)}
                >
                  ← Voltar
                </button>
                <strong>
                  {setMeta[activeGroup.setId]?.name ?? activeGroup.setId}
                </strong>
                <span>
                  {activeGroup.count} carta{activeGroup.count === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="collections-cards">
                {activeGroup.entries.map((entry, i) => {
                  const cached = getCachedCard(baseCardId(entry.cardId))
                  return (
                    <li key={`${entry.pageIndex}-${entry.slotIndex}-${entry.cardId}-${i}`}>
                      <button
                        type="button"
                        className="collections-card-btn"
                        onClick={() =>
                          onJump({
                            pageIndex: entry.pageIndex,
                            slotIndex: entry.slotIndex,
                          })
                        }
                      >
                        <span className="collections-card-art">
                          <CardImage
                            src={cached?.image}
                            alt=""
                            quality="low"
                            cardId={baseCardId(entry.cardId)}
                            cardName={cached?.name}
                            localId={cached?.localId}
                          />
                        </span>
                        <span className="collections-card-meta">
                          <strong>{cached?.name ?? entry.cardId}</strong>
                          <small>
                            #{cached?.localId ?? '—'} · p.{entry.pageIndex + 1} · slot{' '}
                            {entry.slotIndex + 1}
                          </small>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : sortedGroups.length === 0 ? (
            <p className="empty">Nenhuma coleção neste fichário.</p>
          ) : (
            <ul className="collections-list">
              {sortedGroups.map((group) => {
                const meta = setMeta[group.setId]
                const code = meta?.abbreviation ?? group.setId.toUpperCase()
                return (
                  <li key={group.setId}>
                    <button
                      type="button"
                      className="collections-set-btn"
                      onClick={() => setActiveSetId(group.setId)}
                    >
                      <span className="collections-set-logo">
                        {meta?.logo ? (
                          <img src={meta.logo} alt="" loading="lazy" />
                        ) : (
                          <span className="collections-set-logo-ph" aria-hidden />
                        )}
                      </span>
                      <span className="collections-set-meta">
                        <strong>{meta?.name ?? group.setId}</strong>
                        <small>
                          {code} · {group.count} carta{group.count === 1 ? '' : 's'}
                        </small>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {mode === 'select' && (
        <p className="tip">Clique nas cartas para selecionar. Use a bandeja para mover o lote.</p>
      )}
    </aside>
  )
}

function SelectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h10M4 12h16M4 17h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PagesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="7" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="4" width="7" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function CollectionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 3h12a2 2 0 0 1 2 2v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
