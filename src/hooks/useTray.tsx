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
import type { CardSlot, PokedexSlot, TrayItem } from '../types'
import { uid } from '../lib/binderUtils'

const STORAGE_KEY = 'pokebinder-tray-v1'

export type TraySlot = CardSlot | PokedexSlot

type TrayContextValue = {
  items: TrayItem[]
  addSlot: (slot: TraySlot, from?: TrayItem['from']) => string
  removeItem: (id: string) => void
  clear: () => void
  takeItem: (id: string) => TrayItem | undefined
  peekItem: (id: string) => TrayItem | undefined
}

const TrayContext = createContext<TrayContextValue | null>(null)

function load(): TrayItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TrayItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function TrayProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<TrayItem[]>(load)
  const itemsRef = useRef(items)
  itemsRef.current = items

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      /* ignore quota */
    }
  }, [items])

  const addSlot = useCallback((slot: TraySlot, from?: TrayItem['from']) => {
    const id = uid('tray')
    const next = [...itemsRef.current, { id, slot, from }]
    itemsRef.current = next
    setItems(next)
    return id
  }, [])

  const removeItem = useCallback((id: string) => {
    const next = itemsRef.current.filter((i) => i.id !== id)
    itemsRef.current = next
    setItems(next)
  }, [])

  const clear = useCallback(() => {
    itemsRef.current = []
    setItems([])
  }, [])

  const peekItem = useCallback((id: string) => {
    return itemsRef.current.find((i) => i.id === id)
  }, [])

  const takeItem = useCallback((id: string) => {
    const found = itemsRef.current.find((i) => i.id === id)
    if (!found) return undefined
    const next = itemsRef.current.filter((i) => i.id !== id)
    itemsRef.current = next
    setItems(next)
    return found
  }, [])

  const value = useMemo(
    () => ({ items, addSlot, removeItem, clear, takeItem, peekItem }),
    [items, addSlot, removeItem, clear, takeItem, peekItem],
  )

  return <TrayContext.Provider value={value}>{children}</TrayContext.Provider>
}

export function useTray() {
  const ctx = useContext(TrayContext)
  if (!ctx) throw new Error('useTray must be used within TrayProvider')
  return ctx
}
