import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Binder,
  BinderSettings,
  GridLayout,
  Slot,
  SlotRef,
} from '../types'
import {
  createEmptyPage,
  findEmptySlotsOnPage,
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
      // Don't clobber unsaved local edits with equal-or-stale remote
      if (local?.dirty && row.revision <= local.row.revision) return
      applyingRemote.current = true
      skipNextSave.current = true
      applyRow(row, false)
      window.setTimeout(() => {
        applyingRemote.current = false
      }, 50)
    })
  }, [binderId, applyRow])

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
                applyingRemote.current = true
                skipNextSave.current = true
                applyRow(fresh, false)
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

  const swapSlot = useCallback(
    (from: SlotRef, to: SlotRef) => {
      mutate((b) => ({ ...b, pages: swapSlots(b.pages, from, to) }))
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
            ? { ...p, slots: p.slots.map(() => null) }
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
      mutate((b) => ({
        ...b,
        pages: b.pages.map((p, pi) => {
          if (pi !== ref.pageIndex) return p
          const slots = [...p.slots]
          slots[ref.slotIndex] = slot
          return { ...p, slots }
        }),
      }))
    },
    [mutate],
  )

  const addCardsToPage = useCallback(
    (pageIndex: number, cardIds: string[]): number => {
      let placed = 0
      mutate((b) => {
        const pages = b.pages.map((p) => ({ ...p, slots: [...p.slots] }))
        const page = pages[pageIndex]
        if (!page) return b
        const empties = findEmptySlotsOnPage(page, cardIds.length)
        for (let i = 0; i < empties.length; i++) {
          const slotIndex = empties[i]
          pages[pageIndex].slots[slotIndex] = { type: 'card', cardId: cardIds[i] }
          placed++
        }
        return { ...b, pages }
      })
      return placed
    },
    [mutate],
  )

  const togglePin = useCallback(
    (ref: SlotRef) => {
      mutate((b) => ({
        ...b,
        pages: b.pages.map((p, pi) => {
          if (pi !== ref.pageIndex) return p
          const slots = [...p.slots]
          const s = slots[ref.slotIndex]
          if (!s || s.type !== 'card') return p
          slots[ref.slotIndex] = { ...s, pinned: !s.pinned }
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
    reload,
    refreshMembers,
    swapSlot,
    setPageLabel,
    clearPage,
    addPages,
    clearSlot,
    takeSlot,
    setSlot,
    addCardsToPage,
    togglePin,
    reorderPages,
    updateSettings,
    setGrid,
    rename,
    uid,
  }
}
