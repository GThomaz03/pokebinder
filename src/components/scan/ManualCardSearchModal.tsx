import { useEffect, useRef, useState, type FormEvent } from 'react'
import { searchCardsRepo } from '../../api/cards/cardRepository'
import { hydrateCard, seedCardBrief } from '../../api/prices'
import { CardImage } from '../CardImage'
import { LANG_OPTIONS } from '../../i18n'
import { useLanguage } from '../../hooks/useLanguage'
import type { CardLang } from '../../types'
import '../binder/AddCardsModal.css'

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
  onPick: (cardId: string) => void
  reason?: 'conflict' | 'weak' | 'none'
}

const REASON_COPY: Record<NonNullable<Props['reason']>, string> = {
  conflict: 'Arte e número não bateram. Busque a carta manualmente.',
  weak: 'Não tivemos confiança suficiente. Busque a carta manualmente.',
  none: 'Não encontramos a carta. Busque pelo nome.',
}

function searchPlaceholder(lang: CardLang): string {
  if (lang === 'ja') return 'Nome (JP/EN) ou numeração…'
  return 'Nome ou numeração…'
}

function setLabel(card: Brief): string {
  const setId = card.setId ?? card.id.slice(0, card.id.lastIndexOf('-'))
  return `#${card.localId}${setId ? ` · ${setId}` : ''}`
}

export function ManualCardSearchModal({ open, onClose, onPick, reason = 'none' }: Props) {
  const { lang, setLang } = useLanguage()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Brief[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const reqId = useRef(0)
  const queryRef = useRef(query)
  queryRef.current = query

  async function runSearch(nextQuery: string, nextLang: CardLang) {
    const q = nextQuery.trim()
    if (!q) {
      setResults([])
      setSearchError(null)
      return
    }
    const id = ++reqId.current
    setLoading(true)
    setSearchError(null)
    try {
      const data = (await searchCardsRepo(nextLang, q)) as Brief[]
      if (id !== reqId.current) return
      setResults(data)
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
      setQuery('')
      setResults([])
      return
    }
    const q = queryRef.current.trim()
    if (q) void runSearch(q, lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lang])

  if (!open) return null

  function onSearch(e: FormEvent) {
    e.preventDefault()
    void runSearch(query, lang)
  }

  function pick(card: Brief) {
    seedCardBrief(card)
    void hydrateCard(lang, card.id)
    onPick(card.id)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="add-modal scan-manual-modal"
        role="dialog"
        aria-label="Buscar carta manualmente"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="add-head">
          <h2>Buscar carta</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <p className="scan-manual-hint">{REASON_COPY[reason]}</p>

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
          <div className="add-results" style={{ gridColumn: '1 / -1' }}>
            {loading && <p className="state">Buscando…</p>}
            {!loading && searchError && <p className="state error">{searchError}</p>}
            {!loading && !searchError && results.length === 0 && (
              <p className="state">Busque por nome ou numeração. Ao fechar, o scan continua.</p>
            )}
            <div className="result-grid">
              {results.map((card) => (
                <article key={card.id} className="result-item">
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
                  <button type="button" onClick={() => pick(card)}>
                    Usar esta
                  </button>
                </article>
              ))}
            </div>
          </div>
        </div>

        <footer className="add-foot">
          <button type="button" className="primary" onClick={onClose}>
            Continuar scan
          </button>
        </footer>
      </div>
    </div>
  )
}
