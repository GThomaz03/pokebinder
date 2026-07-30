import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  Binder,
  BinderPage,
  BinderSettings,
  GridLayout,
  PokedexSlot,
  Slot,
  SlotRef,
} from '../types'
import {
  cardCount,
  createCustomBinder,
  createEmptyPage,
  createPokedexBinder,
  createWishlistBinder,
  findEmptySlotsOnPage,
  pokedexProgress,
  rebuildPagesForGrid,
  swapSlots,
} from '../lib/binderUtils'
import { saveUserBinders } from '../lib/cloudStorage'
import { useDebouncedEffect } from '../lib/useDebouncedEffect'
import { useAuth } from './useAuth'
import { useCloudSync } from './useCloudSync'

const STORAGE_KEY = 'pokebinder-binders-v1'

type BindersContextValue = {
  binders: Binder[]
  getBinder: (id: string) => Binder | undefined
  createBinder: (name: string, grid?: GridLayout) => Binder
  createWishlist: (name: string, grid?: GridLayout) => Binder
  ensurePokedex: () => Binder
  deleteBinder: (id: string) => void
  renameBinder: (id: string, name: string) => void
  updateSettings: (id: string, patch: Partial<BinderSettings>) => void
  setGrid: (id: string, grid: GridLayout) => void
  setPageLabel: (id: string, pageIndex: number, label: string) => void
  addPages: (id: string, count?: number) => void
  removePage: (id: string, pageIndex: number) => void
  reorderPages: (id: string, fromIndex: number, toIndex: number) => void
  swapSlot: (id: string, from: SlotRef, to: SlotRef) => void
  addCardsToPage: (id: string, pageIndex: number, cardIds: string[]) => number
  clearPage: (id: string, pageIndex: number) => void
  clearSlot: (id: string, ref: SlotRef) => Slot | null
  setSlot: (id: string, ref: SlotRef, slot: Slot) => void
  takeSlot: (id: string, ref: SlotRef) => Slot | null
  updatePokedexSlot: (
    id: string,
    pageIndex: number,
    slotIndex: number,
    patch: Partial<PokedexSlot>,
  ) => void
  setAllMissing: (id: string) => void
  markSlotMissing: (id: string, ref: SlotRef) => void
  togglePin: (id: string, ref: SlotRef) => void
  progress: (id: string) => { owned: number; total: number; filled: number; slots: number }
}

const BindersContext = createContext<BindersContextValue | null>(null)

function load(): Binder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { binders?: Binder[] }
    return parsed.binders ?? []
  } catch {
    return []
  }
}

function touch(binder: Binder): Binder {
  return { ...binder, updatedAt: Date.now() }
}

export function BindersProvider({ children }: { children: ReactNode }) {
  const [binders, setBinders] = useState<Binder[]>(load)
  const bindersRef = useRef(binders)
  bindersRef.current = binders
  const { user, isAuthenticated } = useAuth()
  const { cloudReady, isCloudSavePaused } = useCloudSync()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ binders }))
  }, [binders])

  useEffect(() => {
    function onReload() {
      setBinders(load())
    }
    window.addEventListener('pokebinder:cloud-reload', onReload)
    return () => window.removeEventListener('pokebinder:cloud-reload', onReload)
  }, [])

  useDebouncedEffect(() => {
    if (!isAuthenticated || !user || !cloudReady || isCloudSavePaused()) return
    void saveUserBinders(user.id, binders).catch(() => {
      /* erros de sync são tratados no CloudSyncProvider em fluxos explícitos */
    })
  }, [binders, isAuthenticated, user?.id, cloudReady], 1500)

  const update = useCallback((id: string, fn: (b: Binder) => Binder) => {
    setBinders((prev) => {
      const next = prev.map((b) => (b.id === id ? touch(fn(b)) : b))
      bindersRef.current = next
      return next
    })
  }, [])

  const getBinder = useCallback(
    (id: string) => binders.find((b) => b.id === id),
    [binders],
  )

  const createBinder = useCallback((name: string, grid: GridLayout = '3x3') => {
    const binder = createCustomBinder(name.trim() || 'Meu fichário', grid)
    setBinders((prev) => [binder, ...prev])
    return binder
  }, [])

  const createWishlist = useCallback((name: string, grid: GridLayout = '3x3') => {
    const binder = createWishlistBinder(name.trim() || 'Pokédex desejada', grid)
    setBinders((prev) => [binder, ...prev])
    return binder
  }, [])

  const ensurePokedex = useCallback(() => {
    let created: Binder | null = null
    setBinders((prev) => {
      const existing = prev.find((b) => b.kind === 'pokedex')
      if (existing) {
        created = existing
        return prev
      }
      created = createPokedexBinder('3x3')
      return [created, ...prev]
    })
    if (!created) {
      const fallback = createPokedexBinder('3x3')
      setBinders((prev) => {
        if (prev.some((b) => b.kind === 'pokedex')) return prev
        return [fallback, ...prev]
      })
      return fallback
    }
    return created
  }, [])

  const deleteBinder = useCallback((id: string) => {
    setBinders((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const renameBinder = useCallback(
    (id: string, name: string) => {
      update(id, (b) => ({ ...b, name: name.trim() || b.name }))
    },
    [update],
  )

  const updateSettings = useCallback(
    (id: string, patch: Partial<BinderSettings>) => {
      update(id, (b) => ({ ...b, settings: { ...b.settings, ...patch } }))
    },
    [update],
  )

  const setGrid = useCallback(
    (id: string, grid: GridLayout) => {
      update(id, (b) => ({
        ...b,
        grid,
        pages: rebuildPagesForGrid(b, grid),
      }))
    },
    [update],
  )

  const setPageLabel = useCallback(
    (id: string, pageIndex: number, label: string) => {
      update(id, (b) => {
        const pages = b.pages.map((p, i) =>
          i === pageIndex ? { ...p, label: label.trim() || undefined } : p,
        )
        return { ...b, pages }
      })
    },
    [update],
  )

  const addPages = useCallback(
    (id: string, count = 2) => {
      update(id, (b) => {
        const pages = [...b.pages]
        for (let i = 0; i < count; i++) pages.push(createEmptyPage(b.grid))
        return { ...b, pages }
      })
    },
    [update],
  )

  const removePage = useCallback(
    (id: string, pageIndex: number) => {
      update(id, (b) => {
        if (b.kind === 'pokedex' || b.kind === 'wishlist') return b
        if (b.pages.length <= 2) return b
        const pages = b.pages.filter((_, i) => i !== pageIndex)
        if (pages.length % 2 === 1) pages.push(createEmptyPage(b.grid))
        return { ...b, pages }
      })
    },
    [update],
  )

  const reorderPages = useCallback(
    (id: string, fromIndex: number, toIndex: number) => {
      update(id, (b) => {
        if (fromIndex === toIndex) return b
        if (b.kind === 'pokedex' || b.kind === 'wishlist') return b
        const pages = [...b.pages]
        const [moved] = pages.splice(fromIndex, 1)
        if (!moved) return b
        pages.splice(toIndex, 0, moved)
        return { ...b, pages }
      })
    },
    [update],
  )

  const swapSlot = useCallback(
    (id: string, from: SlotRef, to: SlotRef) => {
      update(id, (b) => ({ ...b, pages: swapSlots(b.pages, from, to) }))
    },
    [update],
  )

  const addCardsToPage = useCallback(
    (id: string, pageIndex: number, cardIds: string[]) => {
      let placed = 0
      update(id, (b) => {
        const pages = b.pages.map((p) => ({ ...p, slots: [...p.slots] }))
        let remaining = [...cardIds]
        let pi = pageIndex

        while (remaining.length > 0 && pi < pages.length) {
          const empties = findEmptySlotsOnPage(pages[pi], remaining.length)
          for (const slotIndex of empties) {
            const cardId = remaining.shift()
            if (!cardId) break
            pages[pi].slots[slotIndex] = { type: 'card', cardId }
            placed++
          }
          if (remaining.length === 0) break
          pi++
          if (pi >= pages.length) {
            pages.push(createEmptyPage(b.grid))
            if (pages.length % 2 === 1) pages.push(createEmptyPage(b.grid))
          }
        }
        return { ...b, pages }
      })
      return placed
    },
    [update],
  )

  const clearPage = useCallback(
    (id: string, pageIndex: number) => {
      update(id, (b) => {
        if (b.kind === 'pokedex' || b.kind === 'wishlist') return b
        const pages = b.pages.map((p, i) =>
          i === pageIndex ? { ...p, slots: p.slots.map(() => null as Slot) } : p,
        )
        return { ...b, pages }
      })
    },
    [update],
  )

  const clearSlot = useCallback(
    (id: string, ref: SlotRef): Slot | null => {
      const binder = bindersRef.current.find((b) => b.id === id)
      if (!binder) return null
      const removed = binder.pages[ref.pageIndex]?.slots[ref.slotIndex] ?? null
      update(id, (b) => {
        const pages = b.pages.map((p, pi) => {
          if (pi !== ref.pageIndex) return p
          const slots = [...p.slots]
          if (b.kind === 'pokedex' || b.kind === 'wishlist') {
            const s = slots[ref.slotIndex]
            if (s?.type === 'pokedex') {
              slots[ref.slotIndex] = {
                ...s,
                ownedCardIds: [],
                topCardId: undefined,
              }
            }
          } else {
            slots[ref.slotIndex] = null
          }
          return { ...p, slots }
        })
        return { ...b, pages }
      })
      return removed
    },
    [update],
  )

  const setSlot = useCallback(
    (id: string, ref: SlotRef, slot: Slot) => {
      update(id, (b) => {
        const pages = b.pages.map((p, pi) => {
          if (pi !== ref.pageIndex) return p
          const slots = [...p.slots]
          slots[ref.slotIndex] = slot
          return { ...p, slots }
        })
        return { ...b, pages }
      })
    },
    [update],
  )

  const takeSlot = useCallback(
    (id: string, ref: SlotRef): Slot | null => {
      const binder = bindersRef.current.find((b) => b.id === id)
      if (!binder || binder.kind === 'pokedex' || binder.kind === 'wishlist') {
        return null
      }
      const taken = binder.pages[ref.pageIndex]?.slots[ref.slotIndex] ?? null
      if (!taken) return null
      update(id, (b) => {
        const pages = b.pages.map((p, pi) => {
          if (pi !== ref.pageIndex) return p
          const slots = [...p.slots]
          slots[ref.slotIndex] = null
          return { ...p, slots }
        })
        return { ...b, pages }
      })
      return taken
    },
    [update],
  )

  const updatePokedexSlot = useCallback(
    (
      id: string,
      pageIndex: number,
      slotIndex: number,
      patch: Partial<PokedexSlot>,
    ) => {
      update(id, (b) => {
        const pages: BinderPage[] = b.pages.map((p, pi) => {
          if (pi !== pageIndex) return p
          const slots = p.slots.map((s, si) => {
            if (si !== slotIndex || s?.type !== 'pokedex') return s
            const next: PokedexSlot = {
              ...s,
              ...patch,
              type: 'pokedex',
              dexId: s.dexId,
            }
            if (next.topCardId && !next.ownedCardIds.includes(next.topCardId)) {
              next.ownedCardIds = [...next.ownedCardIds, next.topCardId]
            }
            return next
          })
          return { ...p, slots }
        })
        return { ...b, pages }
      })
    },
    [update],
  )

  const setAllMissing = useCallback(
    (id: string) => {
      update(id, (b) => {
        if (b.kind !== 'pokedex' && b.kind !== 'wishlist') return b
        const pages = b.pages.map((p) => ({
          ...p,
          slots: p.slots.map((s) =>
            s?.type === 'pokedex'
              ? { ...s, ownedCardIds: [], topCardId: undefined }
              : s,
          ),
        }))
        return { ...b, pages }
      })
    },
    [update],
  )

  const markSlotMissing = useCallback(
    (id: string, ref: SlotRef) => {
      update(id, (b) => {
        const pages = b.pages.map((p, pi) => {
          if (pi !== ref.pageIndex) return p
          const slots = [...p.slots]
          const s = slots[ref.slotIndex]
          if (s?.type === 'pokedex') {
            slots[ref.slotIndex] = {
              ...s,
              ownedCardIds: [],
              topCardId: undefined,
            }
          } else if (s?.type === 'card') {
            slots[ref.slotIndex] = null
          }
          return { ...p, slots }
        })
        return { ...b, pages }
      })
    },
    [update],
  )

  const togglePin = useCallback(
    (id: string, ref: SlotRef) => {
      update(id, (b) => {
        const pages = b.pages.map((p, pi) => {
          if (pi !== ref.pageIndex) return p
          const slots = [...p.slots]
          const s = slots[ref.slotIndex]
          if (s?.type === 'card' || s?.type === 'pokedex') {
            slots[ref.slotIndex] = { ...s, pinned: !s.pinned }
          }
          return { ...p, slots }
        })
        return { ...b, pages }
      })
    },
    [update],
  )

  const progress = useCallback(
    (id: string) => {
      const b = binders.find((x) => x.id === id)
      if (!b) return { owned: 0, total: 0, filled: 0, slots: 0 }
      const poke = pokedexProgress(b)
      const cards = cardCount(b)
      return {
        owned: poke.owned,
        total: poke.total,
        filled: cards.filled,
        slots: cards.total,
      }
    },
    [binders],
  )

  const value = useMemo(
    () => ({
      binders,
      getBinder,
      createBinder,
      createWishlist,
      ensurePokedex,
      deleteBinder,
      renameBinder,
      updateSettings,
      setGrid,
      setPageLabel,
      addPages,
      removePage,
      reorderPages,
      swapSlot,
      addCardsToPage,
      clearPage,
      clearSlot,
      setSlot,
      takeSlot,
      updatePokedexSlot,
      setAllMissing,
      markSlotMissing,
      togglePin,
      progress,
    }),
    [
      binders,
      getBinder,
      createBinder,
      createWishlist,
      ensurePokedex,
      deleteBinder,
      renameBinder,
      updateSettings,
      setGrid,
      setPageLabel,
      addPages,
      removePage,
      reorderPages,
      swapSlot,
      addCardsToPage,
      clearPage,
      clearSlot,
      setSlot,
      takeSlot,
      updatePokedexSlot,
      setAllMissing,
      markSlotMissing,
      togglePin,
      progress,
    ],
  )

  return <BindersContext.Provider value={value}>{children}</BindersContext.Provider>
}

export function useBinders() {
  const ctx = useContext(BindersContext)
  if (!ctx) throw new Error('useBinders must be used within BindersProvider')
  return ctx
}
