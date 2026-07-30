import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDecks } from '../hooks/useDecks'
import { useInventory } from '../hooks/useInventory'
import { deckTotal, validateDeck } from '../lib/deckRules'
import './Decks.css'

type ModalState =
  | { mode: 'create' }
  | { mode: 'rename'; id: string; name: string }
  | null

export function DecksPage() {
  const navigate = useNavigate()
  const { decks, createDeck, renameDeck, deleteDeck } = useDecks()
  const { getQty } = useInventory()
  const [modal, setModal] = useState<ModalState>(null)

  function submit(name: string) {
    if (!modal) return
    const trimmed = name.trim()
    if (!trimmed) return
    if (modal.mode === 'create') {
      const deck = createDeck(trimmed)
      setModal(null)
      navigate(`/decks/${deck.id}`)
      return
    }
    renameDeck(modal.id, trimmed)
    setModal(null)
  }

  return (
    <div className="decks-page">
      <header className="decks-hero">
        <div className="decks-hero-copy">
          <p className="decks-eyebrow">Pokémon TCG</p>
          <h1>Decks</h1>
          <p>
            Monte listas de 60 cartas com as regras oficiais: limite de 4 cópias, Energias
            Básicas livres, 1 Radiant e 1 ACE SPEC. Cruze com o que você já tem no repositório.
          </p>
          <button type="button" className="btn primary" onClick={() => setModal({ mode: 'create' })}>
            Novo deck
          </button>
        </div>
        <div className="decks-hero-art" aria-hidden>
          <span className="orbit o1" />
          <span className="orbit o2" />
          <span className="hero-card c1" />
          <span className="hero-card c2" />
          <span className="hero-card c3" />
        </div>
      </header>

      {decks.length === 0 ? (
        <div className="decks-empty">
          <h2>Nenhum deck ainda</h2>
          <p>Crie o primeiro e comece a buscar Pokémon, Treinadores e Energias.</p>
          <button type="button" className="btn accent" onClick={() => setModal({ mode: 'create' })}>
            Criar deck
          </button>
        </div>
      ) : (
        <div className="deck-grid">
          {decks.map((deck) => {
            const total = deckTotal(deck)
            const v = validateDeck(deck, getQty)
            const pct = Math.min(100, Math.round((total / 60) * 100))
            const ownPct =
              total > 0 ? Math.round((v.ownedNeeded / total) * 100) : 0
            return (
              <article key={deck.id} className="deck-card">
                <button
                  type="button"
                  className="deck-open"
                  onClick={() => navigate(`/decks/${deck.id}`)}
                >
                  <div className="deck-card-top">
                    <span className={`legal-pill ${v.legal && v.complete ? 'ok' : 'bad'}`}>
                      {v.legal && v.complete ? 'Legal 60' : v.complete ? 'Inválido' : `${total}/60`}
                    </span>
                    {v.missingNeeded > 0 && (
                      <span className="miss-pill">Faltam {v.missingNeeded}</span>
                    )}
                  </div>
                  <h2>{deck.name}</h2>
                  <p className="deck-meta">
                    {v.pokemon} Pokémon · {v.trainer} Treinadores · {v.energy} Energias
                  </p>
                  <div className="deck-bars">
                    <div className="bar-row">
                      <span>Lista</span>
                      <div className="bar">
                        <i style={{ width: `${pct}%` }} />
                      </div>
                      <em>{total}/60</em>
                    </div>
                    <div className="bar-row">
                      <span>Tenho</span>
                      <div className="bar own">
                        <i style={{ width: `${ownPct}%` }} />
                      </div>
                      <em>{ownPct}%</em>
                    </div>
                  </div>
                </button>
                <div className="deck-card-actions">
                  <button
                    type="button"
                    onClick={() => setModal({ mode: 'rename', id: deck.id, name: deck.name })}
                  >
                    Renomear
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (window.confirm(`Apagar “${deck.name}”?`)) deleteDeck(deck.id)
                    }}
                  >
                    Apagar
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {modal && (
        <NameModal
          title={modal.mode === 'create' ? 'Novo deck' : 'Renomear deck'}
          initial={modal.mode === 'rename' ? modal.name : 'Meu deck'}
          confirmLabel={modal.mode === 'create' ? 'Criar' : 'Salvar'}
          onClose={() => setModal(null)}
          onSubmit={submit}
        />
      )}
    </div>
  )
}

function NameModal({
  title,
  initial,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  title: string
  initial: string
  confirmLabel: string
  onClose: () => void
  onSubmit: (name: string) => void
}) {
  const [value, setValue] = useState(initial)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(value)
  }

  return (
    <div className="name-modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="name-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>{title}</h2>
        <label>
          Nome
          <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
        </label>
        <div className="name-modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
