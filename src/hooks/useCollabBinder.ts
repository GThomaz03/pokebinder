import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Binder,
  BinderSettings,
  GridLayout,
  Slot,
  SlotRef,
} from '../types'
import {
  canClearOrMoveSlot,
  createEmptyPage,
  isSlotPinned,
  placeCardsWithOverflow,
  rebuildPagesForGrid,
  swapSlots,
  uid,
} from '../lib/binderUtils'
import {
  binderToDoc,
  fetchSharedBinder,
  listMembers,
  patchSharedBinder,
  RevisionConflictError,
  sharedRowToBinder,
  subscribeSharedBinder,
  type BinderMember,
  type SharedBinderDoc,
  type SharedBinderRow,
} from '../lib/collabBinders'
import { useDebouncedEffect } from '../lib/useDebouncedEffect'
import { useAuth } from './useAuth'

type CollabState = {
  row: SharedBinderRow
  binder: Binder
  dirty: boolean
}

type PendingPlace = {
  cardIds: string[]
  preferred: SlotRef
  placedBy: string
}

function collectCardKeys(pages: Binder['pages']): Set<string> {
  const keys = new Set<string>()
  for (const page of pages) {
    for (const slot of page.slots) {
      if (slot?.type === 'card') keys.add(`${slot.cardId}@${slot.placedBy ?? ''}`)
    }
  }
  return keys
}

export function useCollabBinder(binderId: string) {
  const { user } = useAuth()
  const [state, setState] = useState<CollabState | null>(null)
  const [members, setMembers] = useState<BinderMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conflictNotice, setConflictNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const stateRef = useRef(state)
  stateRef.current = state
  const applyingRemote = useRef(false)
  const skipNextSave = useRef(false)
  const pendingPlaceRef = useRef<PendingPlace | null>(null)

  const refreshMembers = useCallback(async () => {
    if (!binderId) return
    try {
      setMembers(await listMembers(binderId))
    } catch {
      /* ignore */
    }
  }, [binderId])

  const applyRow = useCallback((row: SharedBinderRow, markDirty = false) => {
    setState({
      row,
      binder: sharedRowToBinder(row),
      dirty: markDirty,
    })
  }, [])

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!binderId) return
    if (!opts?.silent) setLoading(true)
    setError(null)
    try {
      const row = await fetchSharedBinder(binderId)
      if (!row) {
        setError('Fichário compartilhado não encontrado.')
        setState(null)
        return
      }
      applyingRemote.current = true
      applyRow(row, false)
      skipNextSave.current = true
      await refreshMembers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      if (!opts?.silent) setLoading(false)
      window.setTimeout(() => {
        applyingRemote.current = false
      }, 50)
    }
  }, [binderId, applyRow, refreshMembers])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!binderId) return
    return subscribeSharedBinder(binderId, (row) => {
      const local = stateRef.current
      if (local && row.revision <= local.row.revision) return
      if (local?.dirty && row.revision <= local.row.revision) return
      applyingRemote.current = true
      skipNextSave.current = true
      applyRow(row, false)
      window.setTimeout(() => {
        applyingRemote.current = false
      }, 50)
    })
  }, [binderId, applyRow])

  const reapplyPendingAfterConflict = useCallback(
    (freshBinder: Binder): Binder => {
      const pending = pendingPlaceRef.current
      pendingPlaceRef.current = null
      if (!pending?.cardIds.length) return freshBinder

      const remoteKeys = collectCardKeys(freshBinder.pages)
      const missing = pending.cardIds.filter(
        (id) => !remoteKeys.has(`${id}@${pending.placedBy}`),
      )
      if (!missing.length) return freshBinder

      const { pages } = placeCardsWithOverflow(
        freshBinder.pages,
        pending.preferred,
        missing,
        pending.placedBy,
      )
      return { ...freshBinder, pages, updatedAt: Date.now() }
    },
    [],
  )

  useDebouncedEffect(
    () => {
      const cur = stateRef.current
      if (!cur || !cur.dirty || applyingRemote.current || skipNextSave.current) {
        skipNextSave.current = false
        return
      }
      setSaving(true)
      setConflictNotice(null)
      const doc: SharedBinderDoc = binderToDoc(cur.binder)
      void patchSharedBinder(cur.row.id, cur.row.revision, doc, {
        name: cur.binder.name,
        grid: cur.binder.grid,
      })
        .then((row) => {
          pendingPlaceRef.current = null
          applyingRemote.current = true
          applyRow(row, false)
          window.setTimeout(() => {
            applyingRemote.current = false
          }, 50)
        })
        .catch(async (e) => {
          if (e instanceof RevisionConflictError) {
            setConflictNotice('Outro membro salvou ao mesmo tempo. Recarregando…')
            try {
              const fresh = await fetchSharedBinder(binderId)
              if (fresh) {
                const base = sharedRowToBinder(fresh)
                const merged = reapplyPendingAfterConflict(base)
                applyingRemote.current = true
                if (merged !== base) {
                  setState({
                    row: fresh,
                    binder: merged,
                    dirty: true,
                  })
                  skipNextSave.current = false
                } else {
                  skipNextSave.current = true
                  applyRow(fresh, false)
                }
                window.setTimeout(() => {
                  applyingRemote.current = false
                }, 50)
              }
            } catch {
              /* keep notice */
            }
          } else {
            setError(e instanceof Error ? e.message : 'Erro ao salvar.')
          }
        })
        .finally(() => setSaving(false))
    },
    [state?.binder, state?.dirty, state?.row.revision],
    300,
  )

  const mutate = useCallback((fn: (b: Binder) => Binder) => {
    setState((prev) => {
      if (!prev) return prev
      const nextBinder = { ...fn(prev.binder), updatedAt: Date.now() }
      return {
        ...prev,
        binder: nextBinder,
        dirty: true,
      }
    })
  }, [])

  const binder = state?.binder ?? null
  const row = state?.row ?? null
  const isOwner = Boolean(user && row && user.id === row.ownerId)
  const currentUserId = user?.id

  const swapSlot = useCallback(
    (from: SlotRef, to: SlotRef) => {
      mutate((b) => {
        const a = b.pages[from.pageIndex]?.slots[from.slotIndex] ?? null
        const c = b.pages[to.pageIndex]?.slots[to.slotIndex] ?? null
        if (!canClearOrMoveSlot(a) || !canClearOrMoveSlot(c)) return b
        return { ...b, pages: swapSlots(b.pages, from, to) }
      })
    },
    [mutate],
  )

  const setPageLabel = useCallback(
    (pageIndex: number, label: string) => {
      mutate((b) => ({
        ...b,
        pages: b.pages.map((p, i) => (i === pageIndex ? { ...p, label } : p)),
      }))
    },
    [mutate],
  )

  const clearPage = useCallback(
    (pageIndex: number) => {
      mutate((b) => ({
        ...b,
        pages: b.pages.map((p, i) =>
          i === pageIndex
            ? {
                ...p,
                slots: p.slots.map((s) => (isSlotPinned(s) ? s : null)),
              }
            : p,
        ),
      }))
    },
    [mutate],
  )

  const addPages = useCallback(
    (count = 2) => {
      mutate((b) => {
        const pages = [...b.pages]
        for (let i = 0; i < count; i++) pages.push(createEmptyPage(b.grid))
        return { ...b, pages }
      })
    },
    [mutate],
  )

  const clearSlot = useCallback(
    (ref: SlotRef): Slot | null => {
      let taken: Slot | null = null
      mutate((b) => {
        const cur = b.pages[ref.pageIndex]?.slots[ref.slotIndex] ?? null
        if (!canClearOrMoveSlot(cur)) return b
        const pages = b.pages.map((p, pi) => {
          if (pi !== ref.pageIndex) return p
          const slots = [...p.slots]
          taken = slots[ref.slotIndex] ?? null
          slots[ref.slotIndex] = null
          return { ...p, slots }
        })
        return { ...b, pages }
      })
      return taken
    },
    [mutate],
  )

  const takeSlot = useCallback(
    (ref: SlotRef): Slot | null => clearSlot(ref),
    [clearSlot],
  )

  const setSlot = useCallback(
    (ref: SlotRef, slot: Slot) => {
      mutate((b) => {
        const cur = b.pages[ref.pageIndex]?.slots[ref.slotIndex] ?? null
        if (isSlotPinned(cur)) return b
        const stamped: Slot =
          slot && slot.type === 'card' && currentUserId
            ? { ...slot, placedBy: slot.placedBy ?? currentUserId }
            : slot
        return {
          ...b,
          pages: b.pages.map((p, pi) => {
            if (pi !== ref.pageIndex) return p
            const slots = [...p.slots]
            slots[ref.slotIndex] = stamped
            return { ...p, slots }
          }),
        }
      })
    },
    [mutate, currentUserId],
  )

  const placeCards = useCallback(
    (preferred: SlotRef, cardIds: string[]): number => {
      if (!currentUserId || !cardIds.length) return 0
      let placed = 0
      pendingPlaceRef.current = {
        cardIds: [...cardIds],
        preferred: { ...preferred },
        placedBy: currentUserId,
      }
      mutate((b) => {
        const result = placeCardsWithOverflow(
          b.pages,
          preferred,
          cardIds,
          currentUserId,
        )
        placed = result.placed
        return { ...b, pages: result.pages }
      })
      return placed
    },
    [mutate, currentUserId],
  )

  const addCardsToPage = useCallback(
    (pageIndex: number, cardIds: string[]): number => {
      return placeCards({ pageIndex, slotIndex: 0 }, cardIds)
    },
    [placeCards],
  )

  const togglePin = useCallback(
    (ref: SlotRef) => {
      if (!currentUserId) return
      mutate((b) => ({
        ...b,
        pages: b.pages.map((p, pi) => {
          if (pi !== ref.pageIndex) return p
          const slots = [...p.slots]
          const s = slots[ref.slotIndex]
          if (!s || s.type !== 'card') return p
          if (s.pinned) {
            if (s.pinnedBy && s.pinnedBy !== currentUserId) return p
            slots[ref.slotIndex] = {
              type: 'card',
              cardId: s.cardId,
              ...(s.placedBy ? { placedBy: s.placedBy } : {}),
              ...(s.missing ? { missing: true } : {}),
            }
            return { ...p, slots }
          }
          slots[ref.slotIndex] = {
            ...s,
            pinned: true,
            pinnedBy: currentUserId,
          }
          return { ...p, slots }
        }),
      }))
    },
    [mutate, currentUserId],
  )

  const markSlotMissing = useCallback(
    (ref: SlotRef) => {
      mutate((b) => ({
        ...b,
        pages: b.pages.map((p, pi) => {
          if (pi !== ref.pageIndex) return p
          const slots = [...p.slots]
          const s = slots[ref.slotIndex]
          if (!s || s.type !== 'card') return p
          slots[ref.slotIndex] = { ...s, missing: !s.missing }
          return { ...p, slots }
        }),
      }))
    },
    [mutate],
  )

  const reorderPages = useCallback(
    (fromIndex: number, toIndex: number) => {
      mutate((b) => {
        const pages = [...b.pages]
        const [item] = pages.splice(fromIndex, 1)
        pages.splice(toIndex, 0, item)
        return { ...b, pages }
      })
    },
    [mutate],
  )

  const updateSettings = useCallback(
    (patch: Partial<BinderSettings>) => {
      mutate((b) => ({ ...b, settings: { ...b.settings, ...patch } }))
    },
    [mutate],
  )

  const setGrid = useCallback(
    (grid: GridLayout) => {
      mutate((b) => ({
        ...b,
        grid,
        pages: rebuildPagesForGrid(b, grid),
      }))
    },
    [mutate],
  )

  const rename = useCallback(
    (name: string) => {
      mutate((b) => ({ ...b, name: name.trim() || b.name }))
    },
    [mutate],
  )

  return {
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
    addCardsToPage,
    togglePin,
    markSlotMissing,
    reorderPages,
    updateSettings,
    setGrid,
    rename,
    uid,
  }
}
