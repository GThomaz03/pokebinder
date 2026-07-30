import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShareModal } from '../components/ShareModal'
import { useBinders } from '../hooks/useBinders'
import type { Binder } from '../types'
import './Binders.css'

type ModalState =
  | { mode: 'create-custom' }
  | { mode: 'create-wishlist' }
  | { mode: 'rename'; id: string; name: string }
  | null

export function BindersPage() {
  const navigate = useNavigate()
  const {
    binders,
    createBinder,
    createWishlist,
    ensurePokedex,
    deleteBinder,
    renameBinder,
    progress,
  } = useBinders()
  const [modal, setModal] = useState<ModalState>(null)
  const [shareTarget, setShareTarget] = useState<Binder | null>(null)

  function onPokedex() {
    const binder = ensurePokedex()
    navigate(`/binders/${binder.id}`)
  }

  function submitModal(name: string) {
    if (!modal) return
    const trimmed = name.trim()
    if (!trimmed) return

    if (modal.mode === 'create-custom') {
      const binder = createBinder(trimmed)
      setModal(null)
      navigate(`/binders/${binder.id}`)
      return
    }
    if (modal.mode === 'create-wishlist') {
      const binder = createWishlist(trimmed)
      setModal(null)
      navigate(`/binders/${binder.id}`)
      return
    }
    renameBinder(modal.id, trimmed)
    setModal(null)
  }

  return (
    <div className="binders-page">
      <header className="binders-hero">
        <p className="eyebrow">PokéBinder</p>
        <h1>Seus fichários</h1>
        <p>
          Coleções personalizadas, Pokédex de progresso e listas desejadas — com bandeja,
          repositório e ferramentas de edição.
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => setModal({ mode: 'create-custom' })}
          >
            Novo fichário
          </button>
          <button type="button" className="btn accent" onClick={onPokedex}>
            Abrir Pokédex
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setModal({ mode: 'create-wishlist' })}
          >
            Nova Pokédex desejada
          </button>
        </div>
      </header>

      {binders.length === 0 ? (
        <p className="empty">Nenhum fichário ainda. Crie um ou abra a Pokédex.</p>
      ) : (
        <div className="binder-list">
          {binders.map((b) => {
            const prog = progress(b.id)
            const pct =
              b.kind === 'pokedex' || b.kind === 'wishlist'
                ? prog.total
                  ? Math.round((prog.owned / prog.total) * 100)
                  : 0
                : prog.slots
                  ? Math.round((prog.filled / prog.slots) * 100)
                  : 0
            return (
              <article key={b.id} className="binder-card">
                <button
                  type="button"
                  className="binder-open"
                  onClick={() => navigate(`/binders/${b.id}`)}
                >
                  <span className={`kind ${b.kind}`}>
                    {b.kind === 'pokedex'
                      ? 'Pokédex'
                      : b.kind === 'wishlist'
                        ? 'Desejada'
                        : 'Personalizado'}
                  </span>
                  <h2>{b.name}</h2>
                  <p>
                    {b.grid} · {b.pages.length} páginas
                  </p>
                  <div className="bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <span className="pct">
                    {b.kind === 'pokedex' || b.kind === 'wishlist'
                      ? `${prog.owned}/${prog.total} espécies`
                      : `${prog.filled} cartas`}
                  </span>
                </button>
                <div className="card-actions">
                  <button
                    type="button"
                    className="rename"
                    onClick={() => setShareTarget(b)}
                  >
                    Compartilhar
                  </button>
                  <button
                    type="button"
                    className="rename"
                    onClick={() => setModal({ mode: 'rename', id: b.id, name: b.name })}
                  >
                    Renomear
                  </button>
                  {b.kind !== 'pokedex' && (
                    <button
                      type="button"
                      className="delete"
                      onClick={() => {
                        if (window.confirm(`Apagar “${b.name}”?`)) deleteBinder(b.id)
                      }}
                    >
                      Apagar
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {modal && (
        <NameModal
          title={
            modal.mode === 'create-custom'
              ? 'Novo fichário'
              : modal.mode === 'create-wishlist'
                ? 'Nova Pokédex desejada'
                : 'Renomear fichário'
          }
          initial={
            modal.mode === 'rename'
              ? modal.name
              : modal.mode === 'create-wishlist'
                ? 'Pokédex desejada'
                : 'Meu fichário'
          }
          confirmLabel={modal.mode === 'rename' ? 'Salvar' : 'Criar'}
          onClose={() => setModal(null)}
          onSubmit={submitModal}
        />
      )}

      <ShareModal
        open={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        resourceType="binder"
        resourceId={shareTarget?.id ?? ''}
        title={shareTarget?.name ?? ''}
        snapshot={shareTarget}
      />
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
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            required
          />
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
