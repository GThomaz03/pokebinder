import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AddCardsModal } from '../components/binder/AddCardsModal'
import { BinderSpread } from '../components/binder/BinderSpread'
import { CardDetailsModal } from '../components/binder/CardDetailsModal'
import { CollabSettingsDrawer } from '../components/binder/CollabSettingsDrawer'
import { ToolsSidebar } from '../components/binder/ToolsSidebar'
import { CardImage } from '../components/CardImage'
import { useAuth } from '../hooks/useAuth'
import { useCollabBinder } from '../hooks/useCollabBinder'
import { useInventory } from '../hooks/useInventory'
import { useLanguage } from '../hooks/useLanguage'
import { useTray } from '../hooks/useTray'
import { getCachedCard, hydrateCard } from '../api/prices'
import { baseCardId, parseOwnedKey } from '../api/tcgdex'
import { binderTotalBrl } from '../lib/binderUtils'
import {
  loadOwnerViz,
  memberColor,
  saveOwnerViz,
  type OwnerVizState,
} from '../lib/collabColors'
import {
  disableInviteLink,
  enableInviteLink,
  inviteFriend,
  inviteUrl,
  leaveBinder,
  removeMember,
  deleteSharedBinder,
} from '../lib/collabBinders'
import { listFollowing, type Profile } from '../lib/social'
import type { SlotRef, ToolMode } from '../types'
import { slotDisplayCardId } from '../types'
import '../themes/binder-themes.css'
import './BinderView.css'
import './CollabBinder.css'

export function CollabBinderViewPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user, requireAuth, isAuthenticated } = useAuth()
  const {
    binder,
    row,
    members,
    loading,
    error,
    saving,
    conflictNotice,
    isOwner,
    currentUserId,
    reload,
    refreshMembers,
    swapSlot,
    setPageLabel,
    clearPage,
    addPages,
    clearSlot,
    takeSlot,
    setSlot,
    placeCards,
    togglePin,
    markSlotMissing,
    reorderPages,
    updateSettings,
    setGrid,
    rename,
  } = useCollabBinder(id)

  const { ensureOwned, ensureOwnedMany } = useInventory()
  const { lang } = useLanguage()
  const tray = useTray()

  const [spreadIndex, setSpreadIndex] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [replaceRef, setReplaceRef] = useState<SlotRef | null>(null)
  const [toolMode, setToolMode] = useState<ToolMode>('none')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [detailsKey, setDetailsKey] = useState<string | null>(null)
  const [inspectRef, setInspectRef] = useState<SlotRef | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [friends, setFriends] = useState<Profile[]>([])
  const [priceTick, setPriceTick] = useState(0)
  const [ownerViz, setOwnerViz] = useState<OwnerVizState>({
    enabled: false,
    visibleUserIds: [],
  })

  const overlayOpen = settingsOpen || addOpen || Boolean(detailsKey)

  const pages = binder?.pages ?? []
  const totalSpreads = Math.max(1, Math.ceil(pages.length / 2))
  const safeSpread = Math.min(spreadIndex, totalSpreads - 1)
  const leftIndex = Math.max(0, safeSpread * 2)
  const rightIndex = leftIndex + 1
  const leftPage = pages[leftIndex]
  const rightPage = pages[rightIndex] ?? null

  useEffect(() => {
    if (spreadIndex !== safeSpread) setSpreadIndex(safeSpread)
  }, [spreadIndex, safeSpread])

  useEffect(() => {
    if (!id || !members.length) return
    setOwnerViz(loadOwnerViz(id, members.map((m) => m.userId)))
  }, [id, members])

  useEffect(() => {
    if (!user || !settingsOpen) return
    void listFollowing(user.id).then(setFriends).catch(() => setFriends([]))
  }, [user, settingsOpen])

  const canPrevPage = safeSpread > 0
  const canNextPage = safeSpread < totalSpreads - 1 || true
  const pageNavLabel = `${safeSpread + 1} / ${totalSpreads}`

  const goPrevPage = useRef(() => {})
  const goNextPage = useRef(() => {})
  goPrevPage.current = () => {
    if (!canPrevPage) return
    setSpreadIndex((s) => Math.max(0, s - 1))
  }
  goNextPage.current = () => {
    if (!binder) return
    if (safeSpread < totalSpreads - 1) {
      setSpreadIndex(safeSpread + 1)
      return
    }
    addPages(2)
    setSpreadIndex(totalSpreads)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (overlayOpen) return
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrevPage.current()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNextPage.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlayOpen])

  const searchMatches = useMemo(() => {
    if (!binder || !search.trim()) return []
    const q = search.trim().toLowerCase()
    const out: { pageIndex: number; slotIndex: number; label: string }[] = []
    binder.pages.forEach((page, pageIndex) => {
      page.slots.forEach((slot, slotIndex) => {
        if (!slot || slot.type !== 'card') return
        const cached = getCachedCard(baseCardId(slot.cardId))
        if (
          cached?.name.toLowerCase().includes(q) ||
          slot.cardId.toLowerCase().includes(q) ||
          (cached?.localId ?? '').toLowerCase().includes(q)
        ) {
          out.push({
            pageIndex,
            slotIndex,
            label: cached?.name ?? slot.cardId,
          })
        }
      })
    })
    return out
  }, [binder, search, priceTick])

  useEffect(() => {
    if (!binder) return
    const keys: string[] = []
    for (const page of binder.pages) {
      for (const slot of page.slots) {
        const idKey = slotDisplayCardId(slot)
        if (idKey) keys.push(idKey)
      }
    }
    void Promise.all(
      keys.slice(0, 80).map((key) => {
        const { lang: keyLang } = parseOwnedKey(key)
        return hydrateCard(keyLang ?? lang, key, Boolean(keyLang))
      }),
    ).then(() => setPriceTick((t) => t + 1))
  }, [binder, lang])

  const searchHits = useMemo(() => {
    const set = new Set<string>()
    for (const m of searchMatches) set.add(`p${m.pageIndex}-s${m.slotIndex}`)
    return set
  }, [searchMatches])

  const totalValueLabel = useMemo(() => {
    if (!binder) return null
    void priceTick
    const total = binderTotalBrl(binder)
    return total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }, [binder, priceTick])

  const memberNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of members) {
      map[m.userId] = m.displayName || m.username || 'Treinador'
    }
    return map
  }, [members])

  const ownerColorFor = useMemo(() => {
    return (placedBy: string | undefined): string | null => {
      if (!ownerViz.enabled || !placedBy) return null
      if (!ownerViz.visibleUserIds.includes(placedBy)) return null
      return memberColor(placedBy)
    }
  }, [ownerViz])

  function patchOwnerViz(next: OwnerVizState) {
    setOwnerViz(next)
    if (id) saveOwnerViz(id, next)
  }

  const inspectSlot =
    inspectRef && binder
      ? binder.pages[inspectRef.pageIndex]?.slots[inspectRef.slotIndex]
      : null
  const inspectCardKey = slotDisplayCardId(inspectSlot ?? null)

  if (!isAuthenticated) {
    return (
      <div className="missing">
        <p>Entre na conta para abrir fichários compartilhados.</p>
        <Link to="/">Voltar</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="missing">
        <p>Carregando fichário compartilhado…</p>
      </div>
    )
  }

  if (error || !binder || !leftPage || !row) {
    return (
      <div className="missing">
        <p>{error ?? 'Fichário não encontrado.'}</p>
        <Link to="/">Voltar</Link>
      </div>
    )
  }

  const showBatch = toolMode === 'select' && selected.size > 0
  const showTrayChrome = !overlayOpen
  const memberIds = new Set(members.map((m) => m.userId))

  function jumpTo(ref: SlotRef) {
    setSpreadIndex(Math.floor(ref.pageIndex / 2))
    setInspectRef(ref)
  }

  function toggleSelect(ref: SlotRef) {
    const key = `p${ref.pageIndex}-s${ref.slotIndex}`
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function sendToTray(ref: SlotRef) {
    const current = binder!.pages[ref.pageIndex]?.slots[ref.slotIndex] ?? null
    if (!current || current.type !== 'card' || current.pinned) return
    const slot = takeSlot(ref)
    if (!slot || slot.type !== 'card') return
    tray.addSlot(slot, {
      binderId: binder!.id,
      pageIndex: ref.pageIndex,
      slotIndex: ref.slotIndex,
    })
  }

  function placeFromTray(trayItemId: string, to: SlotRef) {
    const current = binder!.pages[to.pageIndex]?.slots[to.slotIndex] ?? null
    if (current && 'pinned' in current && current.pinned) return
    const item = tray.peekItem(trayItemId)
    if (!item || item.slot.type !== 'card') return

    // Place on the exact drop target (swap if occupied), like solo binders.
    if (current && current.type === 'card') {
      tray.takeItem(trayItemId)
      tray.addSlot(current, {
        binderId: binder!.id,
        pageIndex: to.pageIndex,
        slotIndex: to.slotIndex,
      })
      setSlot(to, {
        type: 'card',
        cardId: item.slot.cardId,
        ...(currentUserId ? { placedBy: currentUserId } : {}),
      })
      return
    }

    tray.takeItem(trayItemId)
    setSlot(to, {
      type: 'card',
      cardId: item.slot.cardId,
      ...(currentUserId ? { placedBy: currentUserId } : {}),
      ...(item.slot.missing ? { missing: true } : {}),
    })
  }

  async function toggleInviteLink() {
    if (!isOwner || !row) return
    setInviteBusy(true)
    try {
      if (row.inviteToken) {
        await disableInviteLink(row.id)
      } else {
        const token = await enableInviteLink(row.id)
        await navigator.clipboard.writeText(inviteUrl(token))
        setInviteCopied(true)
        window.setTimeout(() => setInviteCopied(false), 2000)
      }
      await reload({ silent: true })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Erro no link de convite.')
    } finally {
      setInviteBusy(false)
    }
  }

  async function copyInvite() {
    if (!row?.inviteToken) return
    await navigator.clipboard.writeText(inviteUrl(row.inviteToken))
    setInviteCopied(true)
    window.setTimeout(() => setInviteCopied(false), 2000)
  }

  async function onInviteFriend(friendId: string) {
    if (!requireAuth() || !row) return
    setInviteBusy(true)
    try {
      await inviteFriend(row.id, friendId)
      await refreshMembers()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Erro ao convidar.')
    } finally {
      setInviteBusy(false)
    }
  }

  async function onRemoveMember(userId: string) {
    if (!row || !window.confirm('Remover este membro?')) return
    try {
      await removeMember(row.id, userId)
      await refreshMembers()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Erro ao remover.')
    }
  }

  async function onLeave() {
    if (!user || !row) return
    if (isOwner) {
      window.alert('O dono não pode sair. Apague o fichário ou transfira depois.')
      return
    }
    if (!window.confirm('Sair deste fichário compartilhado?')) return
    await leaveBinder(row.id, user.id)
    navigate('/')
  }

  async function onDelete() {
    if (!user || !row || !isOwner) return
    if (!window.confirm('Apagar este fichário compartilhado para todos?')) return
    await deleteSharedBinder(row.id, user.id)
    navigate('/')
  }

  const membersPanel = (
    <>
      <section>
        <h3>Membros</h3>
        <ul className="collab-member-list">
          {members.map((m) => {
            const color = memberColor(m.userId)
            const visible = ownerViz.visibleUserIds.includes(m.userId)
            return (
              <li key={m.userId}>
                <span className="collab-member-info">
                  <i className="collab-member-swatch" style={{ background: color }} aria-hidden />
                  <span>
                    <strong>{m.displayName || m.username || 'Treinador'}</strong>
                    <small>
                      {m.role === 'owner' ? 'Dono' : 'Editor'}
                      {m.username ? ` · @${m.username}` : ''}
                    </small>
                  </span>
                </span>
                <span className="collab-member-actions">
                  {ownerViz.enabled && (
                    <label className="collab-viz-check" title="Mostrar borda deste membro">
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={() => {
                          const ids = visible
                            ? ownerViz.visibleUserIds.filter((x) => x !== m.userId)
                            : [...ownerViz.visibleUserIds, m.userId]
                          patchOwnerViz({ ...ownerViz, visibleUserIds: ids })
                        }}
                      />
                      Borda
                    </label>
                  )}
                  {isOwner && m.role !== 'owner' && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void onRemoveMember(m.userId)}
                    >
                      Remover
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h3>Dono das cartas</h3>
        <label className="collab-viz-toggle">
          <span>Ver dono das cartas</span>
          <button
            type="button"
            role="switch"
            aria-checked={ownerViz.enabled}
            className={`switch ${ownerViz.enabled ? 'on' : ''}`}
            onClick={() =>
              patchOwnerViz({
                ...ownerViz,
                enabled: !ownerViz.enabled,
                visibleUserIds:
                  ownerViz.visibleUserIds.length > 0
                    ? ownerViz.visibleUserIds
                    : members.map((m) => m.userId),
              })
            }
          >
            <i />
          </button>
        </label>
        <p className="muted collab-viz-hint">
          Bordas coloridas mostram quem colocou cada carta. Use os checkboxes na lista para filtrar.
        </p>
      </section>

      {isOwner && (
        <>
          <section>
            <h3>Convidar amigo</h3>
            {friends.filter((f) => !memberIds.has(f.id)).length === 0 ? (
              <p className="muted">Siga alguém em Amigos para poder convidar.</p>
            ) : (
              <ul className="collab-member-list">
                {friends
                  .filter((f) => !memberIds.has(f.id))
                  .map((f) => (
                    <li key={f.id}>
                      <span className="collab-member-info">
                        <i
                          className="collab-member-swatch"
                          style={{ background: memberColor(f.id) }}
                          aria-hidden
                        />
                        <span>{f.displayName || f.username}</span>
                      </span>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={inviteBusy}
                        onClick={() => void onInviteFriend(f.id)}
                      >
                        Convidar
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section>
            <h3>Link de convite</h3>
            <div className="collab-invite-actions">
              {row.inviteToken ? (
                <>
                  <button type="button" className="btn accent" onClick={() => void copyInvite()}>
                    {inviteCopied ? 'Copiado!' : 'Copiar link'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={inviteBusy}
                    onClick={() => void toggleInviteLink()}
                  >
                    Desativar link
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  disabled={inviteBusy}
                  onClick={() => void toggleInviteLink()}
                >
                  Ativar e copiar link
                </button>
              )}
            </div>
          </section>

          <button type="button" className="btn ghost danger-text" onClick={() => void onDelete()}>
            Apagar fichário
          </button>
        </>
      )}

      {!isOwner && (
        <button type="button" className="btn ghost" onClick={() => void onLeave()}>
          Sair do fichário
        </button>
      )}
    </>
  )

  return (
    <div
      className={`binder-view ${showTrayChrome ? 'has-tray' : ''} ${showBatch ? 'has-batch' : ''}`}
      data-binder-theme="mesa"
    >
      <div className="view-top">
        <button
          type="button"
          className="btn-ghost binder-home"
          disabled={!canPrevPage}
          onClick={() => setSpreadIndex(0)}
          title="Ir para o início do fichário"
        >
          ← Início
        </button>
        <h1>{binder.name}</h1>
        <div className="view-actions">
          <span className="kind-pill">Compartilhado</span>
          <span className="collab-sync" title={conflictNotice ?? undefined}>
            {saving ? 'Salvando…' : conflictNotice ? 'Conflito' : 'Ao vivo'}
          </span>
          {totalValueLabel && (
            <span className="binder-total" title="Soma dos preços">
              Total {totalValueLabel}
            </span>
          )}
          <button type="button" className="btn-ghost" onClick={() => setSettingsOpen(true)}>
            Configurações
          </button>
          <button type="button" className="btn-ghost" onClick={() => addPages(2)}>
            + Páginas
          </button>
        </div>
      </div>

      {conflictNotice && <p className="collab-banner">{conflictNotice}</p>}

      <div className="binder-layout">
        <ToolsSidebar
          binder={binder}
          mode={toolMode}
          onMode={(m) => {
            setToolMode(m)
            if (m !== 'select') setSelected(new Set())
          }}
          selectedCount={selected.size}
          search={search}
          onSearch={setSearch}
          matches={searchMatches}
          onJump={jumpTo}
          onReorder={reorderPages}
          canReorder
        />

        <div className="binder-main">
          <div className="pager" role="navigation" aria-label="Páginas do fichário">
            <button type="button" disabled={!canPrevPage} onClick={() => setSpreadIndex(0)}>
              «
            </button>
            <button type="button" disabled={!canPrevPage} onClick={() => goPrevPage.current()}>
              ‹
            </button>
            <span aria-live="polite">{pageNavLabel}</span>
            <button type="button" disabled={!canNextPage} onClick={() => goNextPage.current()}>
              ›
            </button>
            <button
              type="button"
              disabled={safeSpread >= totalSpreads - 1}
              onClick={() => setSpreadIndex(totalSpreads - 1)}
            >
              »
            </button>
          </div>

          <BinderSpread
            binder={binder}
            leftPage={leftPage}
            rightPage={rightPage}
            leftIndex={leftIndex}
            rightIndex={rightIndex}
            canPrevPage={canPrevPage}
            canNextPage={canNextPage}
            pageLabel={pageNavLabel}
            onPrevPage={() => goPrevPage.current()}
            onNextPage={() => goNextPage.current()}
            selectMode={toolMode === 'select'}
            selected={selected}
            searchHits={toolMode === 'search' ? searchHits : undefined}
            currentUserId={currentUserId}
            memberNames={memberNames}
            ownerColorFor={ownerColorFor}
            onSwap={swapSlot}
            onDropSlotToTray={sendToTray}
            onDropTrayToSlot={placeFromTray}
            onLabelChange={setPageLabel}
            onDeletePage={(pageIndex) => {
              if (window.confirm('Limpar slots desta página? (cartas fixadas são mantidas)')) {
                clearPage(pageIndex)
              }
            }}
            onSelect={toggleSelect}
            onActivate={(ref) => {
              const slot = binder.pages[ref.pageIndex]?.slots[ref.slotIndex]
              setInspectRef(ref)
              if (slot?.type === 'card') setDetailsKey(slot.cardId)
              else {
                setReplaceRef(null)
                setAddOpen(true)
              }
            }}
            onRemove={(ref) => clearSlot(ref)}
            onToTray={sendToTray}
            onReplace={(ref) => {
              const slot = binder.pages[ref.pageIndex]?.slots[ref.slotIndex]
              if (slot && 'pinned' in slot && slot.pinned) return
              setInspectRef(ref)
              setReplaceRef(ref)
              setAddOpen(true)
            }}
            onEdit={(ref) => {
              const slot = binder.pages[ref.pageIndex]?.slots[ref.slotIndex]
              const key = slotDisplayCardId(slot ?? null)
              if (key) setDetailsKey(key)
              setInspectRef(ref)
            }}
            onPin={(ref) => togglePin(ref)}
            onMarkMissing={(ref) => markSlotMissing(ref)}
            onDetails={(ref) => {
              const slot = binder.pages[ref.pageIndex]?.slots[ref.slotIndex]
              const key = slotDisplayCardId(slot ?? null)
              if (key) setDetailsKey(key)
              setInspectRef(ref)
            }}
            showTray={showTrayChrome}
          />
        </div>

        <aside className="inspect-panel" aria-label="Painel da carta">
          <h3>Selecionada</h3>
          {inspectCardKey ? (
            <>
              {getCachedCard(baseCardId(inspectCardKey))?.image && (
                <CardImage
                  src={getCachedCard(baseCardId(inspectCardKey))!.image}
                  alt=""
                  quality="high"
                  className="inspect-img"
                />
              )}
              <p className="inspect-name">
                {getCachedCard(baseCardId(inspectCardKey))?.name ?? 'Carta'}
              </p>
            </>
          ) : (
            <p className="muted">Clique em um slot.</p>
          )}
        </aside>
      </div>

      <CollabSettingsDrawer
        open={settingsOpen}
        binder={binder}
        onClose={() => setSettingsOpen(false)}
        adapters={{
          updateSettings,
          setGrid,
          addPages,
          renameBinder: rename,
          progress: () => {
            let filled = 0
            let slots = 0
            for (const p of binder.pages) {
              slots += p.slots.length
              filled += p.slots.filter(Boolean).length
            }
            return { owned: 0, total: 0, filled, slots }
          },
        }}
        membersPanel={membersPanel}
      />

      <AddCardsModal
        open={addOpen}
        replaceMode={Boolean(replaceRef)}
        onClose={() => {
          setAddOpen(false)
          setReplaceRef(null)
        }}
        onAdd={(cardIds) => {
          if (replaceRef && cardIds[0]) {
            const cur = binder.pages[replaceRef.pageIndex]?.slots[replaceRef.slotIndex]
            if (cur && 'pinned' in cur && cur.pinned) {
              setReplaceRef(null)
              setAddOpen(false)
              return
            }
            setSlot(replaceRef, {
              type: 'card',
              cardId: cardIds[0],
              ...(currentUserId ? { placedBy: currentUserId } : {}),
            })
            ensureOwned(cardIds[0])
            setReplaceRef(null)
            setAddOpen(false)
            return
          }
          const preferred =
            inspectRef ??
            ({ pageIndex: leftIndex, slotIndex: 0 } satisfies SlotRef)
          placeCards(preferred, cardIds)
          ensureOwnedMany(cardIds)
          setAddOpen(false)
        }}
      />

      {detailsKey && (
        <CardDetailsModal
          open
          cardKey={detailsKey}
          settings={binder.settings}
          onClose={() => setDetailsKey(null)}
        />
      )}
    </div>
  )
}
