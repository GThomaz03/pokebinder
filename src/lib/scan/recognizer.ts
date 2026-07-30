import type { ArtHit, CardCandidate, EmbeddingCard, EmbeddingIndex } from './types'
import { SCAN_VISION_MODEL } from './modelConfig'

const IDB_NAME = 'pokebinder-scan-v1'
const IDB_STORE = 'kv'

type WorkerOut =
  | { type: 'ready'; indexSize: number; model: string }
  | {
      type: 'result'
      id: number
      hits: ArtHit[]
      ms: number
    }
  | { type: 'error'; id?: number; message: string }

let worker: Worker | null = null
let workerReady: Promise<void> | null = null
let reqId = 0
const pending = new Map<
  number,
  { resolve: (v: { hits: ArtHit[]; ms: number }) => void; reject: (e: Error) => void }
>()

let indexCache: EmbeddingIndex | null = null
let indexPromise: Promise<EmbeddingIndex | null> | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('idb open failed'))
  })
}

async function idbGet(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(key)
      req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbSet(key: string, value: ArrayBuffer) {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore quota
  }
}

export async function loadEmbeddingIndex(): Promise<EmbeddingIndex | null> {
  if (indexCache) return indexCache
  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        const metaRes = await fetch('/scan/embeddings.json')
        if (!metaRes.ok) return null
        const meta = (await metaRes.json()) as {
          dim: number
          model?: string
          cards: EmbeddingCard[]
        }

        const cacheKey = `embeddings:${meta.model ?? SCAN_VISION_MODEL}:${meta.cards.length}:${meta.dim}`
        let buf = await idbGet(cacheKey)
        if (!buf) {
          const binRes = await fetch('/scan/embeddings.bin')
          if (!binRes.ok) return null
          buf = await binRes.arrayBuffer()
          void idbSet(cacheKey, buf.slice(0))
        }

        const vectors = new Float32Array(buf)
        if (vectors.length !== meta.cards.length * meta.dim) {
          console.warn('[scan] embedding size mismatch')
          return null
        }
        indexCache = { dim: meta.dim, cards: meta.cards, vectors }
        return indexCache
      } catch (err) {
        console.warn('[scan] index load failed', err)
        return null
      }
    })()
  }
  return indexPromise
}

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./clip.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data
      if (msg.type === 'result') {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          p.resolve({ hits: msg.hits, ms: msg.ms })
        }
      } else if (msg.type === 'error' && msg.id != null) {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          p.reject(new Error(msg.message))
        }
      }
    }
  }
  return worker
}

export async function initRecognizer(): Promise<{
  ready: boolean
  indexSize: number
  model: string
}> {
  if (!workerReady) {
    workerReady = (async () => {
      const idx = await loadEmbeddingIndex()
      const w = ensureWorker()
      await new Promise<void>((resolve, reject) => {
        const onMsg = (ev: MessageEvent<WorkerOut>) => {
          if (ev.data.type === 'ready') {
            w.removeEventListener('message', onMsg)
            resolve()
          } else if (ev.data.type === 'error') {
            w.removeEventListener('message', onMsg)
            reject(new Error(ev.data.message))
          }
        }
        w.addEventListener('message', onMsg)
        if (idx) {
          // Copy so we don't detach the main-thread buffer
          const copy = idx.vectors.slice()
          w.postMessage(
            {
              type: 'init',
              index: {
                dim: idx.dim,
                cards: idx.cards,
                vectors: copy.buffer,
              },
            },
            [copy.buffer],
          )
        } else {
          w.postMessage({ type: 'init' })
        }
      })
    })()
  }
  await workerReady
  const idx = await loadEmbeddingIndex()
  return {
    ready: true,
    indexSize: idx?.cards.length ?? 0,
    model: SCAN_VISION_MODEL,
  }
}

export async function identifyByVision(
  canvas: HTMLCanvasElement,
  topK = 5,
): Promise<{ hits: ArtHit[]; ms: number }> {
  await initRecognizer()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.92,
    )
  })
  const id = ++reqId
  const w = ensureWorker()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ type: 'identify', id, blob, topK })
  })
}

export function artHitsToCandidates(hits: ArtHit[]): CardCandidate[] {
  return hits.map((h) => ({
    cardId: h.cardId,
    name: h.name ?? h.cardId,
    localId: h.localId ?? '',
    setId: h.setId ?? h.cardId.split('-')[0]!,
    image: h.image,
    confidence: Math.max(0, Math.min(1, (h.score + 1) / 2)), // map cosine [-1,1] loosely; usually ~0.2–0.5
    reason: 'vision',
    visionScore: h.score,
  }))
}

export function searchIndex(
  index: EmbeddingIndex,
  query: Float32Array,
  topK = 5,
): ArtHit[] {
  const { dim, cards, vectors } = index
  const scores: ArtHit[] = []
  for (let i = 0; i < cards.length; i++) {
    const slice = vectors.subarray(i * dim, (i + 1) * dim)
    let dot = 0
    for (let j = 0; j < dim; j++) dot += query[j]! * slice[j]!
    const c = cards[i]!
    scores.push({
      cardId: c.id,
      score: dot,
      name: c.name,
      localId: c.localId,
      setId: c.setId,
      image: c.image,
    })
  }
  scores.sort((a, b) => b.score - a.score)
  return scores.slice(0, topK)
}
