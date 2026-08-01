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
import { saveUserInventory } from '../lib/cloudStorage'
import { useDebouncedEffect } from '../lib/useDebouncedEffect'
import { useAuth } from './useAuth'
import { useCloudSync } from './useCloudSync'

const STORAGE_KEY = 'pokebinder-inventory-v1'

type InventoryContextValue = {
  inventory: InventoryMap
  getQty: (cardKey: string) => number
  hasCard: (cardKey: string) => boolean
  setQty: (cardKey: string, qty: number) => void
  addQty: (cardKey: string, delta?: number) => void
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
  const { user, isAuthenticated } = useAuth()
  const { cloudReady, isCloudSavePaused } = useCloudSync()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory))
  }, [inventory])

  useEffect(() => {
    function onReload() {
      setInventory(load())
    }
    window.addEventListener('pokebinder:cloud-reload', onReload)
    return () => window.removeEventListener('pokebinder:cloud-reload', onReload)
  }, [])

  useDebouncedEffect(() => {
    if (!isAuthenticated || !user || !cloudReady || isCloudSavePaused()) return
    void saveUserInventory(user.id, inventory).catch(() => {})
  }, [inventory, isAuthenticated, user?.id, cloudReady], 1500)

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
      entries,
      setProgress,
    }),
    [
      inventory,
      getQty,
      hasCard,
      setQty,
      addQty,
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
