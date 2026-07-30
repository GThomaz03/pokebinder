import { useEffect, useRef, useState, type FormEvent } from 'react'
import { searchCards } from '../../api/tcgdex'
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
}

type Props = {
  open: boolean
  onClose: () => void
  onAdd: (cardIds: string[]) => void
  replaceMode?: boolean
}

type SearchCache = {
  lang: CardLang
  query: string
  results: Brief[]
}

/** Module-level cache so reopening the modal does not refetch the last search. */
let lastSearch: SearchCache | null = null

export function AddCardsModal({ open, onClose, onAdd, replaceMode }: Props) {
  const { lang, setLang } = useLanguage()
  const [query, setQuery] = useState(lastSearch?.query ?? '')
  const [results, setResults] = useState<Brief[]>(() =>
    lastSearch && lastSearch.lang === lang ? lastSearch.results : [],
  )
  const [selected, setSelected] = useState<Brief[]>([])
  const [loading, setLoading] = useState(false)
  const [addToCurrent, setAddToCurrent] = useState(true)
  const reqId = useRef(0)

  useEffect(() => {
    if (!open) {
      setSelected([])
      return
    }
    // Restore cached results for this language when reopening.
    if (lastSearch && lastSearch.lang === lang) {
      setQuery(lastSearch.query)
      setResults(lastSearch.results)
    }
  }, [open, lang])

  if (!open) return null

  async function onSearch(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    // Same query+lang already loaded — skip network.
    if (
      lastSearch &&
      lastSearch.lang === lang &&
      lastSearch.query === q &&
      lastSearch.results.length > 0
    ) {
      setResults(lastSearch.results)
      return
    }

    const id = ++reqId.current
    setLoading(true)
    try {
      const data = (await searchCards(lang, q)) as Brief[]
      if (id !== reqId.current) return
      setResults(data)
      lastSearch = { lang, query: q, results: data }
    } catch {
      if (id !== reqId.current) return
      setResults([])
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }

  function toggleSelect(card: Brief) {
    setSelected((prev) => {
      if (prev.some((c) => c.id === card.id)) {
        return prev.filter((c) => c.id !== card.id)
      }
      seedCardBrief(card)
      void hydrateCard(lang, card.id)
      if (replaceMode) return [card]
      return [...prev, card]
    })
  }

  function confirm() {
    onAdd(selected.map((c) => c.id))
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
          <h2>{replaceMode ? 'Trocar carta' : 'Adicionar cartas'}</h2>
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
              placeholder="Buscar por nome…"
              autoFocus
            />
            <button type="submit">Buscar</button>
          </form>
        </div>

        <div className="add-body">
          <div className="add-results">
            {loading && <p className="state">Buscando…</p>}
            {!loading && results.length === 0 && (
              <p className="state">Digite um nome e busque cartas (PT / EN / JA).</p>
            )}
            <div className="result-grid">
              {results.map((card) => {
                const isSel = selected.some((c) => c.id === card.id)
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
                      <span>#{card.localId}</span>
                    </div>
                    <button type="button" onClick={() => toggleSelect(card)}>
                      {isSel ? 'Selecionada' : 'Adicionar'}
                    </button>
                  </article>
                )
              })}
            </div>
          </div>

          <aside className="selected-panel">
            <h3>Selecionadas ({selected.length})</h3>
            {selected.length === 0 ? (
              <p className="state small">As cartas selecionadas aparecem aqui.</p>
            ) : (
              <ul>
                {selected.map((c) => (
                  <li key={c.id}>
                    <span>{c.name}</span>
                    <button type="button" onClick={() => toggleSelect(c)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        <footer className="add-foot">
          {!replaceMode && (
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
          <button
            type="button"
            className="primary"
            disabled={selected.length === 0}
            onClick={confirm}
          >
            {replaceMode ? 'Trocar' : `Adicionar ${selected.length}`}
          </button>
        </footer>
      </div>
    </div>
  )
}
