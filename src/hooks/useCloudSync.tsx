import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Binder, Deck, InventoryMap } from '../types'
import { fetchUserCloudData, uploadLocalData } from '../lib/cloudStorage'
import { useAuth } from './useAuth'
import './useCloudSync.css'

const BINDERS_KEY = 'pokebinder-binders-v1'
const INVENTORY_KEY = 'pokebinder-inventory-v1'
const DECKS_KEY = 'pokebinder-decks-v1'

type LocalSnapshot = {
  binders: Binder[]
  inventory: InventoryMap
  decks: Deck[]
}

type CloudSyncContextValue = {
  cloudReady: boolean
  syncing: boolean
  lastSyncError: string | null
  /** Evita gravar na nuvem enquanto aplica dados vindos dela */
  pauseCloudSave: () => void
  resumeCloudSave: () => void
  isCloudSavePaused: () => boolean
}

const CloudSyncContext = createContext<CloudSyncContextValue | null>(null)

function loadLocalSnapshot(): LocalSnapshot {
  try {
    const bindersRaw = localStorage.getItem(BINDERS_KEY)
    const inventoryRaw = localStorage.getItem(INVENTORY_KEY)
    const decksRaw = localStorage.getItem(DECKS_KEY)

    const binders = bindersRaw
      ? ((JSON.parse(bindersRaw) as { binders?: Binder[] }).binders ?? [])
      : []
    const inventory = inventoryRaw ? (JSON.parse(inventoryRaw) as InventoryMap) : {}
    const decks = decksRaw ? ((JSON.parse(decksRaw) as { decks?: Deck[] }).decks ?? []) : []

    return { binders, inventory, decks }
  } catch {
    return { binders: [], inventory: {}, decks: [] }
  }
}

function hasLocalData(snapshot: LocalSnapshot) {
  return (
    snapshot.binders.length > 0 ||
    Object.keys(snapshot.inventory).length > 0 ||
    snapshot.decks.length > 0
  )
}

function hasCloudData(snapshot: LocalSnapshot) {
  return hasLocalData(snapshot)
}

type MergePromptProps = {
  onUseCloud: () => void
  onUploadLocal: () => void
  onDismiss: () => void
}

function MergePrompt({ onUseCloud, onUploadLocal, onDismiss }: MergePromptProps) {
  return (
    <div className="cloud-merge-banner" role="status">
      <div>
        <strong>Dados locais e na nuvem encontrados.</strong>
        <p>Escolha como sincronizar na primeira sessão com login.</p>
      </div>
      <div className="cloud-merge-actions">
        <button type="button" className="btn ghost" onClick={onUseCloud}>
          Usar nuvem
        </button>
        <button type="button" className="btn primary" onClick={onUploadLocal}>
          Enviar local
        </button>
        <button type="button" className="btn ghost" onClick={onDismiss}>
          Depois
        </button>
      </div>
    </div>
  )
}

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [cloudReady, setCloudReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)
  const [mergePrompt, setMergePrompt] = useState<{
    local: LocalSnapshot
    cloud: LocalSnapshot
  } | null>(null)

  const pauseRef = useRef(false)
  const loadedForUser = useRef<string | null>(null)

  const pauseCloudSave = useCallback(() => {
    pauseRef.current = true
  }, [])

  const resumeCloudSave = useCallback(() => {
    pauseRef.current = false
  }, [])

  const isCloudSavePaused = useCallback(() => pauseRef.current, [])

  const applySnapshot = useCallback((snapshot: LocalSnapshot) => {
    pauseRef.current = true
    localStorage.setItem(BINDERS_KEY, JSON.stringify({ binders: snapshot.binders }))
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(snapshot.inventory))
    localStorage.setItem(DECKS_KEY, JSON.stringify({ decks: snapshot.decks }))
    window.dispatchEvent(new CustomEvent('pokebinder:cloud-reload'))
    window.setTimeout(() => {
      pauseRef.current = false
    }, 100)
  }, [])

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated || !user) {
      loadedForUser.current = null
      setCloudReady(false)
      setMergePrompt(null)
      return
    }

    if (loadedForUser.current === user.id) return

    let cancelled = false

    async function init() {
      setSyncing(true)
      setLastSyncError(null)
      try {
        const cloud = await fetchUserCloudData(user!.id)
        if (cancelled) return

        const local = loadLocalSnapshot()
        const cloudSnapshot: LocalSnapshot = {
          binders: cloud?.binders ?? [],
          inventory: cloud?.inventory ?? {},
          decks: cloud?.decks ?? [],
        }

        const localHas = hasLocalData(local)
        const cloudHas = hasCloudData(cloudSnapshot)

        if (localHas && cloudHas) {
          setMergePrompt({ local, cloud: cloudSnapshot })
        } else if (cloudHas) {
          applySnapshot(cloudSnapshot)
        } else if (localHas) {
          await uploadLocalData(user!.id, local)
        }

        loadedForUser.current = user!.id
        setCloudReady(true)
      } catch (e) {
        if (!cancelled) {
          setLastSyncError(e instanceof Error ? e.message : 'Erro ao sincronizar.')
          setCloudReady(true)
        }
      } finally {
        if (!cancelled) setSyncing(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [authLoading, isAuthenticated, user, applySnapshot])

  const handleUseCloud = useCallback(() => {
    if (!mergePrompt) return
    applySnapshot(mergePrompt.cloud)
    setMergePrompt(null)
  }, [mergePrompt, applySnapshot])

  const handleUploadLocal = useCallback(async () => {
    if (!mergePrompt || !user) return
    setSyncing(true)
    try {
      await uploadLocalData(user.id, mergePrompt.local)
      applySnapshot(mergePrompt.local)
      setMergePrompt(null)
    } catch (e) {
      setLastSyncError(e instanceof Error ? e.message : 'Erro ao enviar dados locais.')
    } finally {
      setSyncing(false)
    }
  }, [mergePrompt, user, applySnapshot])

  const value: CloudSyncContextValue = {
    cloudReady,
    syncing,
    lastSyncError,
    pauseCloudSave,
    resumeCloudSave,
    isCloudSavePaused,
  }

  return (
    <CloudSyncContext.Provider value={value}>
      {mergePrompt && (
        <MergePrompt
          onUseCloud={handleUseCloud}
          onUploadLocal={() => void handleUploadLocal()}
          onDismiss={() => setMergePrompt(null)}
        />
      )}
      {children}
    </CloudSyncContext.Provider>
  )
}

export function useCloudSync() {
  const ctx = useContext(CloudSyncContext)
  if (!ctx) throw new Error('useCloudSync must be used within CloudSyncProvider')
  return ctx
}
