import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ShareModal } from '../components/ShareModal'
import { ExportLigaModal } from '../components/ExportLigaModal'
import { useAuth } from '../hooks/useAuth'
import { useBinders } from '../hooks/useBinders'
import { useInventory } from '../hooks/useInventory'
import {
  createSharedBinder,
  listMySharedBinders,
  type SharedBinderRow,
} from '../lib/collabBinders'
import { inventoryCardCount } from '../lib/repositoryBinder'
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
import {
  DEX_TEMPLATE_CATEGORIES,
  NATIONAL_TEMPLATE,
  getDexTemplate,
  templatesByCategory,
  type DexTemplate,
  type DexTemplateCategory,
} from '../data/dexTemplates'
import './Binders.css'
import './CollabBinder.css'

type ModalState =
  | { mode: 'create-custom' }
  | { mode: 'pick-template'; kind: 'pokedex' | 'wishlist' }
  | { mode: 'create-from-template'; kind: 'pokedex' | 'wishlist'; templateId: string }
  | { mode: 'create-shared' }
  | { mode: 'rename'; id: string; name: string }
  | null

export function BindersPage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, requireAuth, openAuth } = useAuth()
  const {
    binders,
    createBinder,
    createPokedex,
    createWishlist,
    ensureRepository,
    deleteBinder,
    renameBinder,
    reorderBinders,
    progress,
  } = useBinders()
  const { entries: inventoryEntries } = useInventory()
  const inventoryTotal = inventoryCardCount(inventoryEntries)
  const [modal, setModal] = useState<ModalState>(null)
  const [shareTarget, setShareTarget] = useState<Binder | null>(null)
  const [ligaExportTarget, setLigaExportTarget] = useState<Binder | null>(null)
  const [published, setPublished] = useState<PublishedResource[]>([])
  const [following, setFollowing] = useState<Profile[]>([])
  const [sharedBinders, setSharedBinders] = useState<SharedBinderRow[]>([])
  const [pubBusy, setPubBusy] = useState<string | null>(null)
  const [collabBusy, setCollabBusy] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

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

  useEffect(() => {
    if (!menuOpenId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpenId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpenId])

  function onRepository() {
    const binder = ensureRepository()
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
    if (modal.mode === 'create-from-template') {
      const template = getDexTemplate(modal.templateId)
      const dexIds = template?.dexIds
      const binder =
        modal.kind === 'wishlist'
          ? createWishlist(trimmed, { dexIds })
          : createPokedex(trimmed, { dexIds })
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
    if (modal.mode === 'rename') {
      renameBinder(modal.id, trimmed)
      setModal(null)
    }
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

  function onBinderDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDragId(null)
    if (!over || active.id === over.id) return
    reorderBinders(String(active.id), String(over.id))
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
            className="btn btn-action btn-action--custom"
            onClick={() => setModal({ mode: 'create-custom' })}
          >
            Novo fichário
          </button>
          <button
            type="button"
            className="btn btn-action btn-action--shared"
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
          <button
            type="button"
            className="btn btn-action btn-action--pokedex"
            onClick={() => setModal({ mode: 'pick-template', kind: 'pokedex' })}
          >
            Nova Pokédex
          </button>
          <button
            type="button"
            className="btn btn-action btn-action--wishlist"
            onClick={() => setModal({ mode: 'pick-template', kind: 'wishlist' })}
          >
            Nova Pokédex desejada
          </button>
          <button
            type="button"
            className="btn btn-action btn-action--repository"
            onClick={onRepository}
          >
            Abrir Repositório
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => {
            setMenuOpenId(null)
            setActiveDragId(String(e.active.id))
          }}
          onDragCancel={() => setActiveDragId(null)}
          onDragEnd={onBinderDragEnd}
        >
          <SortableContext items={binders.map((b) => b.id)} strategy={rectSortingStrategy}>
            <div className="binder-list" aria-label="Lista de fichários — arraste para reordenar">
              {binders.map((b) => {
                const prog = progress(b.id)
                const pct =
                  b.kind === 'pokedex' || b.kind === 'wishlist'
                    ? prog.total
                      ? Math.round((prog.owned / prog.total) * 100)
                      : 0
                    : b.kind === 'repository'
                      ? inventoryTotal > 0
                        ? 100
                        : 0
                      : prog.slots
                        ? Math.round((prog.filled / prog.slots) * 100)
                        : 0
                const publishedOnProfile = isPublished(b.id)
                return (
                  <SortableBinderCard
                    key={b.id}
                    binder={b}
                    pct={pct}
                    progressLabel={
                      b.kind === 'pokedex' || b.kind === 'wishlist'
                        ? `${prog.owned}/${prog.total} espécies`
                        : b.kind === 'repository'
                          ? `${inventoryTotal} cartas`
                          : `${prog.filled} cartas`
                    }
                    metaLabel={
                      b.kind === 'repository'
                        ? `${b.grid} · ${inventoryTotal} cartas`
                        : `${b.grid} · ${b.pages.length} páginas`
                    }
                    publishedOnProfile={publishedOnProfile}
                    menuOpen={menuOpenId === b.id}
                    pubBusy={pubBusy === b.id}
                    dragging={activeDragId === b.id}
                    onOpen={() => navigate(`/binders/${b.id}`)}
                    onMenuToggle={() =>
                      setMenuOpenId(menuOpenId === b.id ? null : b.id)
                    }
                    onMenuClose={() => setMenuOpenId(null)}
                    onShare={() => {
                      setMenuOpenId(null)
                      setShareTarget(b)
                    }}
                    onExportLiga={() => {
                      setMenuOpenId(null)
                      setLigaExportTarget(b)
                    }}
                    onPublish={() => {
                      setMenuOpenId(null)
                      void togglePublish(b)
                    }}
                    onRename={() => {
                      setMenuOpenId(null)
                      setModal({ mode: 'rename', id: b.id, name: b.name })
                    }}
                    onDelete={() => {
                      setMenuOpenId(null)
                      if (window.confirm(`Apagar “${b.name}”?`)) deleteBinder(b.id)
                    }}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {modal?.mode === 'pick-template' && (
        <TemplatePickerModal
          kind={modal.kind}
          onClose={() => setModal(null)}
          onPick={(template) =>
            setModal({
              mode: 'create-from-template',
              kind: modal.kind,
              templateId: template.id,
            })
          }
        />
      )}

      {modal && modal.mode !== 'pick-template' && (
        <NameModal
          title={
            modal.mode === 'create-custom'
              ? 'Novo fichário'
              : modal.mode === 'create-from-template'
                ? modal.kind === 'wishlist'
                  ? 'Nova Pokédex desejada'
                  : 'Nova Pokédex'
                : modal.mode === 'create-shared'
                  ? 'Novo fichário compartilhado'
                  : 'Renomear fichário'
          }
          initial={
            modal.mode === 'rename'
              ? modal.name
              : modal.mode === 'create-from-template'
                ? getDexTemplate(modal.templateId)?.name ??
                  (modal.kind === 'wishlist' ? 'Pokédex desejada' : 'Pokédex')
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

      <ExportLigaModal
        open={Boolean(ligaExportTarget)}
        onClose={() => setLigaExportTarget(null)}
        title={ligaExportTarget?.name ?? 'Binder'}
        binder={ligaExportTarget}
        inventoryEntries={inventoryEntries}
      />
    </div>
  )
}

function SortableBinderCard({
  binder,
  pct,
  progressLabel,
  metaLabel,
  publishedOnProfile,
  menuOpen,
  pubBusy,
  dragging,
  onOpen,
  onMenuToggle,
  onMenuClose,
  onShare,
  onExportLiga,
  onPublish,
  onRename,
  onDelete,
}: {
  binder: Binder
  pct: number
  progressLabel: string
  metaLabel: string
  publishedOnProfile: boolean
  menuOpen: boolean
  pubBusy: boolean
  dragging: boolean
  onOpen: () => void
  onMenuToggle: () => void
  onMenuClose: () => void
  onShare: () => void
  onExportLiga: () => void
  onPublish: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: binder.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const kindLabel =
    binder.kind === 'pokedex'
      ? 'Pokédex'
      : binder.kind === 'wishlist'
        ? 'Desejada'
        : binder.kind === 'repository'
          ? 'Repositório'
          : 'Personalizado'

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`binder-card${publishedOnProfile ? ' is-public' : ''}${
        isDragging || dragging ? ' is-dragging' : ''
      }`}
    >
      {publishedOnProfile && (
        <span className="binder-public-badge" title="Visível no seu perfil">
          No perfil
        </span>
      )}
      <BinderCardMenu
        open={menuOpen}
        busy={pubBusy}
        published={publishedOnProfile}
        canDelete={binder.kind !== 'repository'}
        onToggle={onMenuToggle}
        onClose={onMenuClose}
        onShare={onShare}
        onExportLiga={onExportLiga}
        onPublish={onPublish}
        onRename={onRename}
        onDelete={onDelete}
      />
      <button
        type="button"
        className="binder-open"
        {...attributes}
        {...listeners}
        onClick={onOpen}
      >
        <span className={`kind ${binder.kind}`}>{kindLabel}</span>
        <h2>{binder.name}</h2>
        <p>{metaLabel}</p>
        <div className="bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <span className="pct">{progressLabel}</span>
      </button>
    </article>
  )
}

function BinderCardMenu({
  open,
  busy,
  published,
  canDelete,
  onToggle,
  onClose,
  onShare,
  onExportLiga,
  onPublish,
  onRename,
  onDelete,
}: {
  open: boolean
  busy: boolean
  published: boolean
  canDelete: boolean
  onToggle: () => void
  onClose: () => void
  onShare: () => void
  onExportLiga: () => void
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
    <div className="binder-menu" ref={rootRef}>
      <button
        type="button"
        className="binder-menu-trigger"
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
        <div className="binder-menu-panel" role="menu" id={menuId}>
          <button type="button" role="menuitem" onClick={onShare}>
            Compartilhar
          </button>
          <button type="button" role="menuitem" onClick={onExportLiga}>
            Exportar Liga Pokémon
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={onPublish}>
            {busy ? '…' : published ? 'Despublicar do perfil' : 'Publicar no perfil'}
          </button>
          <button type="button" role="menuitem" onClick={onRename}>
            Renomear
          </button>
          {canDelete && (
            <button type="button" role="menuitem" className="is-danger" onClick={onDelete}>
              Apagar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function TemplatePickerModal({
  kind,
  onClose,
  onPick,
}: {
  kind: 'pokedex' | 'wishlist'
  onClose: () => void
  onPick: (template: DexTemplate) => void
}) {
  const [category, setCategory] = useState<DexTemplateCategory>('generation')
  const list = templatesByCategory(category)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="name-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="template-modal"
        role="dialog"
        aria-modal="true"
        aria-label={kind === 'wishlist' ? 'Modelo de Pokédex desejada' : 'Modelo de Pokédex'}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="template-modal-head">
          <div>
            <h2>{kind === 'wishlist' ? 'Pokédex desejada' : 'Nova Pokédex'}</h2>
            <p>Escolha um modelo — cada slot já vem com um Pokémon definido.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <button
          type="button"
          className="template-national"
          onClick={() => onPick(NATIONAL_TEMPLATE)}
        >
          <strong>{NATIONAL_TEMPLATE.name}</strong>
          <span>{NATIONAL_TEMPLATE.description}</span>
        </button>

        <div className="template-tabs" role="tablist" aria-label="Categoria do modelo">
          {DEX_TEMPLATE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              className={category === c.id ? 'active' : ''}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="template-grid" role="tabpanel">
          {list.map((t) => (
            <button
              key={t.id}
              type="button"
              className="template-card"
              onClick={() => onPick(t)}
            >
              <strong>{t.name}</strong>
              <span>{t.description ?? `${t.dexIds.length} Pokémon`}</span>
              <em>{t.dexIds.length}</em>
            </button>
          ))}
        </div>
      </div>
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
    setValue(initial)
  }, [initial])

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
