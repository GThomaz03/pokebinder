import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { baseCardId } from '../api/tcgdex'
import type { InventoryMap } from '../types'

const STORAGE_KEY = 'pokebinder-inventory-v1'

type InventoryContextValue = {
  inventory: InventoryMap
  getQty: (cardKey: string) => number
  hasCard: (cardKey: string) => boolean
  setQty: (cardKey: string, qty: number) => void
  addQty: (cardKey: string, delta?: number) => void
  /** Ensure at least 1 when marked owned in a binder */
  ensureOwned: (cardKey: string) => void
  ensureOwnedMany: (cardKeys: string[]) => void
  entries: { key: string; qty: number }[]
  setProgress: Record<string, { owned: number; total: number }>
}

const InventoryContext = createContext<InventoryContextValue | null>(null)

function load(): InventoryMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return (JSON.parse(raw) as InventoryMap) ?? {}
  } catch {
    return {}
  }
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [inventory, setInventory] = useState<InventoryMap>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory))
  }, [inventory])

  const getQty = useCallback(
    (cardKey: string) => {
      const q = inventory[cardKey] ?? inventory[baseCardId(cardKey)] ?? 0
      return q
    },
    [inventory],
  )

  const hasCard = useCallback((cardKey: string) => getQty(cardKey) > 0, [getQty])

  const setQty = useCallback((cardKey: string, qty: number) => {
    setInventory((prev) => {
      const next = { ...prev }
      const n = Math.max(0, Math.floor(qty))
      if (n <= 0) delete next[cardKey]
      else next[cardKey] = n
      return next
    })
  }, [])

  const addQty = useCallback((cardKey: string, delta = 1) => {
    setInventory((prev) => {
      const cur = prev[cardKey] ?? 0
      const n = Math.max(0, cur + delta)
      const next = { ...prev }
      if (n <= 0) delete next[cardKey]
      else next[cardKey] = n
      return next
    })
  }, [])

  const ensureOwned = useCallback((cardKey: string) => {
    setInventory((prev) => {
      if ((prev[cardKey] ?? 0) >= 1) return prev
      return { ...prev, [cardKey]: 1 }
    })
  }, [])

  const ensureOwnedMany = useCallback((cardKeys: string[]) => {
    setInventory((prev) => {
      let changed = false
      const next = { ...prev }
      for (const k of cardKeys) {
        if ((next[k] ?? 0) < 1) {
          next[k] = 1
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  const entries = useMemo(
    () =>
      Object.entries(inventory)
        .filter(([, q]) => q > 0)
        .map(([key, qty]) => ({ key, qty }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    [inventory],
  )

  const setProgress = useMemo(() => {
    const map: Record<string, { owned: number; total: number }> = {}
    for (const { key, qty } of entries) {
      const setId = key.includes('-') ? baseCardId(key).slice(0, baseCardId(key).lastIndexOf('-')) : 'other'
      if (!map[setId]) map[setId] = { owned: 0, total: 0 }
      map[setId].total += 1
      if (qty > 0) map[setId].owned += 1
    }
    return map
  }, [entries])

  const value = useMemo(
    () => ({
      inventory,
      getQty,
      hasCard,
      setQty,
      addQty,
      ensureOwned,
      ensureOwnedMany,
      entries,
      setProgress,
    }),
    [
      inventory,
      getQty,
      hasCard,
      setQty,
      addQty,
      ensureOwned,
      ensureOwnedMany,
      entries,
      setProgress,
    ],
  )

  return (
    <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
  )
}

export function useInventory() {
  const ctx = useContext(InventoryContext)
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider')
  return ctx
}
