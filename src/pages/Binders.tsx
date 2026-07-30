import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShareModal } from '../components/ShareModal'
import { useAuth } from '../hooks/useAuth'
import { useBinders } from '../hooks/useBinders'
import {
  createSharedBinder,
  listMySharedBinders,
  type SharedBinderRow,
} from '../lib/collabBinders'
import {
  initials,
  listFollowing,
  listMyPublished,
  publishResourceToProfile,
  unpublishResource,
  type Profile,
  type PublishedResource,
} from '../lib/social'
import type { Binder } from '../types'
import './Binders.css'
import './CollabBinder.css'

type ModalState =
  | { mode: 'create-custom' }
  | { mode: 'create-wishlist' }
  | { mode: 'create-shared' }
  | { mode: 'rename'; id: string; name: string }
  | null

export function BindersPage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, requireAuth, openAuth } = useAuth()
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
  const [published, setPublished] = useState<PublishedResource[]>([])
  const [following, setFollowing] = useState<Profile[]>([])
  const [sharedBinders, setSharedBinders] = useState<SharedBinderRow[]>([])
  const [pubBusy, setPubBusy] = useState<string | null>(null)
  const [collabBusy, setCollabBusy] = useState(false)

  const refreshSocial = useCallback(async () => {
    if (!user) {
      setPublished([])
      setFollowing([])
      setSharedBinders([])
      return
    }
    try {
      const [pubs, friends, shared] = await Promise.all([
        listMyPublished(user.id),
        listFollowing(user.id),
        listMySharedBinders(user.id),
      ])
      setPublished(pubs)
      setFollowing(friends)
      setSharedBinders(shared)
    } catch {
      /* social / collab tables may not exist yet */
    }
  }, [user])

  useEffect(() => {
    void refreshSocial()
  }, [refreshSocial, isAuthenticated])

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
    if (modal.mode === 'create-shared') {
      if (!requireAuth() || !user) return
      setCollabBusy(true)
      void createSharedBinder(user.id, trimmed)
        .then((row) => {
          setModal(null)
          navigate(`/collab/${row.id}`)
        })
        .catch((e) => {
          window.alert(e instanceof Error ? e.message : 'Erro ao criar fichário compartilhado.')
        })
        .finally(() => setCollabBusy(false))
      return
    }
    renameBinder(modal.id, trimmed)
    setModal(null)
  }

  function isPublished(binderId: string) {
    return published.some((p) => p.resourceType === 'binder' && p.resourceId === binderId)
  }

  async function togglePublish(binder: Binder) {
    if (!requireAuth() || !user) return
    setPubBusy(binder.id)
    try {
      if (isPublished(binder.id)) {
        await unpublishResource(user.id, 'binder', binder.id, false)
      } else {
        await publishResourceToProfile(user.id, 'binder', binder.id, binder.name, binder)
      }
      await refreshSocial()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Erro ao publicar.')
    } finally {
      setPubBusy(null)
    }
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
          <button
            type="button"
            className="btn accent"
            onClick={() => {
              if (!isAuthenticated) {
                openAuth('signin')
                return
              }
              setModal({ mode: 'create-shared' })
            }}
          >
            Novo compartilhado
          </button>
          <button type="button" className="btn ghost" onClick={onPokedex}>
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

      {isAuthenticated && following.length > 0 && (
        <section className="following-strip" aria-label="Seguindo">
          <div className="following-strip__head">
            <h2>Seguindo</h2>
            <Link to="/amigos">Ver todos</Link>
          </div>
          <div className="following-strip__row">
            {following.slice(0, 12).map((p) => (
              <Link
                key={p.id}
                to={p.username ? `/u/${p.username}` : '/amigos'}
                className="following-chip"
              >
                <span className="following-chip__av" aria-hidden>
                  {initials(p)}
                </span>
                <span>{p.displayName || p.username}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {isAuthenticated && (
        <section aria-label="Fichários compartilhados">
          <div className="following-strip__head">
            <h2>Compartilhados comigo</h2>
          </div>
          {sharedBinders.length === 0 ? (
            <p className="empty">
              Nenhum fichário colaborativo ainda. Crie um ou aceite um link de convite.
            </p>
          ) : (
            <div className="collab-list">
              {sharedBinders.map((s) => (
                <article key={s.id} className="collab-card">
                  <button
                    type="button"
                    className="open"
                    onClick={() => navigate(`/collab/${s.id}`)}
                  >
                    <span className="kind">Ao vivo</span>
                    <h2>{s.name}</h2>
                    <p>
                      {s.grid} · rev {s.revision}
                      {s.ownerId === user?.id ? ' · você é dono' : ''}
                    </p>
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {binders.length === 0 ? (
        <p className="empty">Nenhum fichário pessoal ainda. Crie um ou abra a Pokédex.</p>
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
            const publishedOnProfile = isPublished(b.id)
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
                    {publishedOnProfile ? ' · No perfil' : ''}
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
                  <button type="button" className="rename" onClick={() => setShareTarget(b)}>
                    Compartilhar
                  </button>
                  <button
                    type="button"
                    className="rename"
                    disabled={pubBusy === b.id}
                    onClick={() => void togglePublish(b)}
                  >
                    {pubBusy === b.id
                      ? '…'
                      : publishedOnProfile
                        ? 'Despublicar'
                        : 'Publicar no perfil'}
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
                : modal.mode === 'create-shared'
                  ? 'Novo fichário compartilhado'
                  : 'Renomear fichário'
          }
          initial={
            modal.mode === 'rename'
              ? modal.name
              : modal.mode === 'create-wishlist'
                ? 'Pokédex desejada'
                : modal.mode === 'create-shared'
                  ? 'Fichário com amigos'
                  : 'Meu fichário'
          }
          confirmLabel={
            modal.mode === 'rename' ? 'Salvar' : collabBusy ? 'Criando…' : 'Criar'
          }
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
        onPublished={() => void refreshSocial()}
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
