import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShareModal } from '../components/ShareModal'
import { useAuth } from '../hooks/useAuth'
import { useDecks } from '../hooks/useDecks'
import { useInventory } from '../hooks/useInventory'
import { deckTotal, validateDeck } from '../lib/deckRules'
import {
  listMyPublished,
  publishResourceToProfile,
  unpublishResource,
  type PublishedResource,
} from '../lib/social'
import type { Deck } from '../types'
import './Decks.css'

type ModalState =
  | { mode: 'create' }
  | { mode: 'rename'; id: string; name: string }
  | null

export function DecksPage() {
  const navigate = useNavigate()
  const { user, requireAuth } = useAuth()
  const { decks, createDeck, renameDeck, deleteDeck } = useDecks()
  const { getQty } = useInventory()
  const [modal, setModal] = useState<ModalState>(null)
  const [shareTarget, setShareTarget] = useState<Deck | null>(null)
  const [published, setPublished] = useState<PublishedResource[]>([])
  const [pubBusy, setPubBusy] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const refreshPublished = useCallback(async () => {
    if (!user) {
      setPublished([])
      return
    }
    try {
      setPublished(await listMyPublished(user.id))
    } catch {
      /* ignore if tables missing */
    }
  }, [user])

  useEffect(() => {
    void refreshPublished()
  }, [refreshPublished])

  useEffect(() => {
    if (!menuOpenId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpenId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpenId])

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

  function isPublished(deckId: string) {
    return published.some((p) => p.resourceType === 'deck' && p.resourceId === deckId)
  }

  async function togglePublish(deck: Deck) {
    if (!requireAuth() || !user) return
    setPubBusy(deck.id)
    try {
      if (isPublished(deck.id)) {
        await unpublishResource(user.id, 'deck', deck.id, false)
      } else {
        await publishResourceToProfile(user.id, 'deck', deck.id, deck.name, deck)
      }
      await refreshPublished()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Erro ao publicar.')
    } finally {
      setPubBusy(null)
    }
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
            const ownPct = total > 0 ? Math.round((v.ownedNeeded / total) * 100) : 0
            const onProfile = isPublished(deck.id)
            return (
              <article
                key={deck.id}
                className={`deck-card${onProfile ? ' is-public' : ''}`}
              >
                {onProfile && (
                  <span className="deck-public-badge" title="Visível no seu perfil">
                    No perfil
                  </span>
                )}
                <DeckCardMenu
                  open={menuOpenId === deck.id}
                  busy={pubBusy === deck.id}
                  published={onProfile}
                  onToggle={() =>
                    setMenuOpenId(menuOpenId === deck.id ? null : deck.id)
                  }
                  onClose={() => setMenuOpenId(null)}
                  onShare={() => {
                    setMenuOpenId(null)
                    setShareTarget(deck)
                  }}
                  onPublish={() => {
                    setMenuOpenId(null)
                    void togglePublish(deck)
                  }}
                  onRename={() => {
                    setMenuOpenId(null)
                    setModal({ mode: 'rename', id: deck.id, name: deck.name })
                  }}
                  onDelete={() => {
                    setMenuOpenId(null)
                    if (window.confirm(`Apagar “${deck.name}”?`)) deleteDeck(deck.id)
                  }}
                />
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

      <ShareModal
        open={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        resourceType="deck"
        resourceId={shareTarget?.id ?? ''}
        title={shareTarget?.name ?? ''}
        snapshot={shareTarget}
        onPublished={() => void refreshPublished()}
      />
    </div>
  )
}

function DeckCardMenu({
  open,
  busy,
  published,
  onToggle,
  onClose,
  onShare,
  onPublish,
  onRename,
  onDelete,
}: {
  open: boolean
  busy: boolean
  published: boolean
  onToggle: () => void
  onClose: () => void
  onShare: () => void
  onPublish: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open, onClose])

  return (
    <div className="deck-menu" ref={rootRef}>
      <button
        type="button"
        className="deck-menu-trigger"
        aria-label="Mais opções"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        ⋮
      </button>
      {open && (
        <div className="deck-menu-panel" role="menu" id={menuId}>
          <button type="button" role="menuitem" onClick={onShare}>
            Compartilhar
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={onPublish}>
            {busy ? '…' : published ? 'Despublicar do perfil' : 'Publicar no perfil'}
          </button>
          <button type="button" role="menuitem" onClick={onRename}>
            Renomear
          </button>
          <button type="button" role="menuitem" className="is-danger" onClick={onDelete}>
            Apagar
          </button>
        </div>
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
