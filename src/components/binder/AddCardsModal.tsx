import { useEffect, useRef, useState, type FormEvent } from 'react'
import { searchCardsRepo } from '../../api/cards/cardRepository'
import { hydrateCard, seedCardBrief } from '../../api/prices'
import { CardImage } from '../CardImage'
import { LANG_OPTIONS } from '../../i18n'
import { useLanguage } from '../../hooks/useLanguage'
import type { CardLang } from '../../types'
import './AddCardsModal.css'

type Brief = {
  id: string
  name: string
  localId: string | number
  image?: string
  setId?: string
}

type Props = {
  open: boolean
  onClose: () => void
  onAdd: (cardIds: string[]) => void
  replaceMode?: boolean
  /** Hide binder-only “add to current page” checkbox (e.g. repository). */
  inventoryMode?: boolean
}

type SearchCache = {
  lang: CardLang
  query: string
  results: Brief[]
}

/** Module-level cache so reopening the modal does not refetch the last search. */
let lastSearch: SearchCache | null = null

function searchPlaceholder(lang: CardLang): string {
  if (lang === 'ja') return 'Nome (JP/EN) ou numeração (ex: ピカチュウ, 009/094)…'
  return 'Nome ou numeração (ex: Pikachu, 25, #025, 009/094)…'
}

function setLabel(card: Brief): string {
  const setId = card.setId ?? card.id.slice(0, card.id.lastIndexOf('-'))
  return `#${card.localId}${setId ? ` · ${setId}` : ''}`
}

export function AddCardsModal({
  open,
  onClose,
  onAdd,
  replaceMode,
  inventoryMode = false,
}: Props) {
  const { lang, setLang } = useLanguage()
  const [query, setQuery] = useState(lastSearch?.query ?? '')
  const [results, setResults] = useState<Brief[]>(() =>
    lastSearch && lastSearch.lang === lang ? lastSearch.results : [],
  )
  const [selected, setSelected] = useState<Brief[]>([])
  /** Quantities for inventory mode — default 1 per selected card. */
  const [qtyById, setQtyById] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addToCurrent, setAddToCurrent] = useState(true)
  const reqId = useRef(0)
  const queryRef = useRef(query)
  queryRef.current = query

  const totalCopies = inventoryMode
    ? selected.reduce((sum, c) => sum + (qtyById[c.id] ?? 1), 0)
    : selected.length

  async function runSearch(nextQuery: string, nextLang: CardLang) {
    const q = nextQuery.trim()
    if (!q) {
      setResults([])
      setSearchError(null)
      return
    }

    if (
      lastSearch &&
      lastSearch.lang === nextLang &&
      lastSearch.query === q &&
      lastSearch.results.length > 0
    ) {
      setResults(lastSearch.results)
      setSearchError(null)
      return
    }

    const id = ++reqId.current
    setLoading(true)
    setSearchError(null)
    try {
      const data = (await searchCardsRepo(nextLang, q)) as Brief[]
      if (id !== reqId.current) return
      for (const card of data) seedCardBrief(card)
      setResults(data)
      lastSearch = { lang: nextLang, query: q, results: data }
      if (data.length === 0) setSearchError(null)
    } catch {
      if (id !== reqId.current) return
      setResults([])
      setSearchError('Catálogo indisponível no momento. Tente novamente.')
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setSelected([])
      setQtyById({})
      return
    }
    if (lastSearch && lastSearch.lang === lang) {
      setQuery(lastSearch.query)
      setResults(lastSearch.results)
      return
    }
    const q = queryRef.current.trim()
    if (q) {
      setResults([])
      void runSearch(q, lang)
    } else {
      setResults([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reopen / lang change
  }, [open, lang])

  if (!open) return null

  function onSearch(e: FormEvent) {
    e.preventDefault()
    void runSearch(query, lang)
  }

  function toggleSelect(card: Brief) {
    setSelected((prev) => {
      if (prev.some((c) => c.id === card.id)) {
        setQtyById((q) => {
          const next = { ...q }
          delete next[card.id]
          return next
        })
        return prev.filter((c) => c.id !== card.id)
      }
      seedCardBrief(card)
      void hydrateCard(lang, card.id)
      if (inventoryMode) {
        setQtyById((q) => ({ ...q, [card.id]: q[card.id] ?? 1 }))
      }
      if (replaceMode) return [card]
      return [...prev, card]
    })
  }

  function setQty(cardId: string, next: number) {
    const clamped = Math.max(1, Math.min(99, Math.floor(next) || 1))
    setQtyById((q) => ({ ...q, [cardId]: clamped }))
  }

  function bumpQty(cardId: string, delta: number) {
    setQty(cardId, (qtyById[cardId] ?? 1) + delta)
  }

  function confirm() {
    if (inventoryMode) {
      const ids: string[] = []
      for (const c of selected) {
        const n = qtyById[c.id] ?? 1
        for (let i = 0; i < n; i++) ids.push(c.id)
      }
      onAdd(ids)
    } else {
      onAdd(selected.map((c) => c.id))
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="add-modal"
        role="dialog"
        aria-label={replaceMode ? 'Trocar carta' : 'Adicionar cartas'}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="add-head">
          <h2>
            {replaceMode
              ? 'Trocar carta'
              : inventoryMode
                ? 'Adicionar ao repositório'
                : 'Adicionar cartas'}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="add-toolbar">
          <div className="lang-flags">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={lang === opt.value ? 'active' : ''}
                onClick={() => setLang(opt.value as CardLang)}
              >
                {opt.short}
              </button>
            ))}
          </div>
          <form className="add-search" onSubmit={onSearch}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder(lang)}
              autoFocus
            />
            <button type="submit">Buscar</button>
          </form>
        </div>

        <div className="add-body">
          <div className="add-results">
            {loading && <p className="state">Buscando…</p>}
            {!loading && searchError && <p className="state error">{searchError}</p>}
            {!loading && !searchError && results.length === 0 && (
              <p className="state">
                Busque por nome ou numeração da carta (PT / EN / JA).
              </p>
            )}
            <div className="result-grid">
              {results.map((card) => {
                const isSel = selected.some((c) => c.id === card.id)
                const qty = qtyById[card.id] ?? 1
                return (
                  <article key={card.id} className={`result-item ${isSel ? 'selected' : ''}`}>
                    <CardImage
                      src={card.image}
                      alt=""
                      quality="low"
                      cardId={card.id}
                      cardName={card.name}
                      localId={card.localId}
                    />
                    <div>
                      <strong>{card.name}</strong>
                      <span>{setLabel(card)}</span>
                    </div>
                    {inventoryMode && isSel ? (
                      <div className="result-qty">
                        <button
                          type="button"
                          aria-label="Diminuir quantidade"
                          disabled={qty <= 1}
                          onClick={() => bumpQty(card.id, -1)}
                        >
                          −
                        </button>
                        <span aria-live="polite">{qty}</span>
                        <button
                          type="button"
                          aria-label="Aumentar quantidade"
                          disabled={qty >= 99}
                          onClick={() => bumpQty(card.id, 1)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="result-qty-remove"
                          aria-label="Remover seleção"
                          onClick={() => toggleSelect(card)}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => toggleSelect(card)}>
                        {isSel ? 'Selecionada' : 'Adicionar'}
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          </div>

          <aside className="selected-panel">
            <h3>
              Selecionadas ({selected.length}
              {inventoryMode && totalCopies !== selected.length ? ` · ${totalCopies} cópias` : ''})
            </h3>
            {selected.length === 0 ? (
              <p className="state small">As cartas selecionadas aparecem aqui.</p>
            ) : (
              <ul>
                {selected.map((c) => {
                  const qty = qtyById[c.id] ?? 1
                  return (
                    <li key={c.id} className={inventoryMode ? 'has-qty' : undefined}>
                      <span>{c.name}</span>
                      {inventoryMode && (
                        <div className="sel-qty">
                          <button
                            type="button"
                            aria-label={`Diminuir ${c.name}`}
                            disabled={qty <= 1}
                            onClick={() => bumpQty(c.id, -1)}
                          >
                            −
                          </button>
                          <span>{qty}</span>
                          <button
                            type="button"
                            aria-label={`Aumentar ${c.name}`}
                            disabled={qty >= 99}
                            onClick={() => bumpQty(c.id, 1)}
                          >
                            +
                          </button>
                        </div>
                      )}
                      <button type="button" onClick={() => toggleSelect(c)} aria-label="Remover">
                        ×
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>
        </div>

        <footer className="add-foot">
          {!replaceMode && !inventoryMode && (
            <label className="check">
              <input
                type="checkbox"
                checked={addToCurrent}
                onChange={(e) => setAddToCurrent(e.target.checked)}
              />
              Adicionar na página atual
            </label>
          )}
          {replaceMode && <span className="state small">Selecione uma carta para o slot.</span>}
          {inventoryMode && !replaceMode && (
            <span className="state small">
              Use + / − para definir quantas cópias de cada carta adicionar.
            </span>
          )}
          <button
            type="button"
            className="primary"
            disabled={selected.length === 0}
            onClick={confirm}
          >
            {replaceMode
              ? 'Trocar'
              : inventoryMode
                ? `Adicionar ${totalCopies}`
                : `Adicionar ${selected.length}`}
          </button>
        </footer>
      </div>
    </div>
  )
}
