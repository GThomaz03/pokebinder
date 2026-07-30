import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { uid } from '../lib/binderUtils'
import {
  copiesOfName,
  maxAllowedForEntry,
  validateDeck,
  type DeckValidation,
} from '../lib/deckRules'
import type { Deck, DeckEntry } from '../types'
import { saveUserDecks } from '../lib/cloudStorage'
import { useDebouncedEffect } from '../lib/useDebouncedEffect'
import { useAuth } from './useAuth'
import { useCloudSync } from './useCloudSync'
import { useInventory } from './useInventory'

const STORAGE_KEY = 'pokebinder-decks-v1'

type DecksContextValue = {
  decks: Deck[]
  getDeck: (id: string) => Deck | undefined
  createDeck: (name: string, notes?: string) => Deck
  renameDeck: (id: string, name: string) => void
  updateNotes: (id: string, notes: string) => void
  deleteDeck: (id: string) => void
  setCardQty: (deckId: string, entry: DeckEntry, qty: number) => void
  addCard: (deckId: string, entry: Omit<DeckEntry, 'qty'>, qty?: number) => boolean
  removeCard: (deckId: string, cardId: string) => void
  clearDeck: (deckId: string) => void
  validate: (deckId: string) => DeckValidation | null
}

const DecksContext = createContext<DecksContextValue | null>(null)

function load(): Deck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { decks?: Deck[] }
    return parsed.decks ?? []
  } catch {
    return []
  }
}

function touch(deck: Deck): Deck {
  return { ...deck, updatedAt: Date.now() }
}

export function DecksProvider({ children }: { children: ReactNode }) {
  const [decks, setDecks] = useState<Deck[]>(load)
  const { getQty } = useInventory()
  const { user, isAuthenticated } = useAuth()
  const { cloudReady, isCloudSavePaused } = useCloudSync()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ decks }))
  }, [decks])

  useEffect(() => {
    function onReload() {
      setDecks(load())
    }
    window.addEventListener('pokebinder:cloud-reload', onReload)
    return () => window.removeEventListener('pokebinder:cloud-reload', onReload)
  }, [])

  useDebouncedEffect(() => {
    if (!isAuthenticated || !user || !cloudReady || isCloudSavePaused()) return
    void saveUserDecks(user.id, decks).catch(() => {})
  }, [decks, isAuthenticated, user?.id, cloudReady], 1500)

  const update = useCallback((id: string, fn: (d: Deck) => Deck) => {
    setDecks((prev) => prev.map((d) => (d.id === id ? touch(fn(d)) : d)))
  }, [])

  const getDeck = useCallback((id: string) => decks.find((d) => d.id === id), [decks])

  const createDeck = useCallback((name: string, notes?: string) => {
    const now = Date.now()
    const deck: Deck = {
      id: uid('deck'),
      name: name.trim() || 'Novo deck',
      notes: notes?.trim() || undefined,
      cards: [],
      createdAt: now,
      updatedAt: now,
    }
    setDecks((prev) => [deck, ...prev])
    return deck
  }, [])

  const renameDeck = useCallback(
    (id: string, name: string) => {
      update(id, (d) => ({ ...d, name: name.trim() || d.name }))
    },
    [update],
  )

  const updateNotes = useCallback(
    (id: string, notes: string) => {
      update(id, (d) => ({ ...d, notes: notes.trim() || undefined }))
    },
    [update],
  )

  const deleteDeck = useCallback((id: string) => {
    setDecks((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const setCardQty = useCallback(
    (deckId: string, entry: DeckEntry, qty: number) => {
      update(deckId, (d) => {
        const max = maxAllowedForEntry(entry)
        const others = copiesOfName(d, entry.name) - (d.cards.find((c) => c.cardId === entry.cardId)?.qty ?? 0)
        const capped = Math.max(0, Math.min(qty, max - others))
        if (capped <= 0) {
          return { ...d, cards: d.cards.filter((c) => c.cardId !== entry.cardId) }
        }
        const exists = d.cards.some((c) => c.cardId === entry.cardId)
        const cards = exists
          ? d.cards.map((c) => (c.cardId === entry.cardId ? { ...c, qty: capped } : c))
          : [...d.cards, { ...entry, qty: capped }]
        return { ...d, cards }
      })
    },
    [update],
  )

  const addCard = useCallback(
    (deckId: string, entry: Omit<DeckEntry, 'qty'>, qty = 1): boolean => {
      let ok = true
      update(deckId, (d) => {
        const max = maxAllowedForEntry(entry)
        const currentName = copiesOfName(d, entry.name)
        const existing = d.cards.find((c) => c.cardId === entry.cardId)
        const room = max - (currentName - (existing?.qty ?? 0))
        if (room <= 0) {
          ok = false
          return d
        }
        const add = Math.min(qty, room)
        if (existing) {
          return {
            ...d,
            cards: d.cards.map((c) =>
              c.cardId === entry.cardId ? { ...c, qty: c.qty + add } : c,
            ),
          }
        }
        return { ...d, cards: [...d.cards, { ...entry, qty: add }] }
      })
      return ok
    },
    [update],
  )

  const removeCard = useCallback(
    (deckId: string, cardId: string) => {
      update(deckId, (d) => ({
        ...d,
        cards: d.cards.filter((c) => c.cardId !== cardId),
      }))
    },
    [update],
  )

  const clearDeck = useCallback(
    (deckId: string) => {
      update(deckId, (d) => ({ ...d, cards: [] }))
    },
    [update],
  )

  const validate = useCallback(
    (deckId: string) => {
      const deck = decks.find((d) => d.id === deckId)
      if (!deck) return null
      return validateDeck(deck, getQty)
    },
    [decks, getQty],
  )

  const value = useMemo(
    () => ({
      decks,
      getDeck,
      createDeck,
      renameDeck,
      updateNotes,
      deleteDeck,
      setCardQty,
      addCard,
      removeCard,
      clearDeck,
      validate,
    }),
    [
      decks,
      getDeck,
      createDeck,
      renameDeck,
      updateNotes,
      deleteDeck,
      setCardQty,
      addCard,
      removeCard,
      clearDeck,
      validate,
    ],
  )

  return <DecksContext.Provider value={value}>{children}</DecksContext.Provider>
}

export function useDecks() {
  const ctx = useContext(DecksContext)
  if (!ctx) throw new Error('useDecks must be used within DecksProvider')
  return ctx
}
