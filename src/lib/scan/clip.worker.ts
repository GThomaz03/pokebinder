/// <reference lib="webworker" />
/**
 * Visual recognition worker: MobileCLIP-S2 embed + kNN over the card index.
 */
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@xenova/transformers'
import { SCAN_VISION_MODEL } from './modelConfig'

env.allowLocalModels = false

type IndexPayload = {
  dim: number
  cards: Array<{
    id: string
    name: string
    localId: string
    setId: string
    image?: string
  }>
  vectors: Float32Array
}

let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null
let vision: Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>> | null =
  null
let index: IndexPayload | null = null

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d > 0 ? dot / d : 0
}

function l2normalize(data: Float32Array): Float32Array {
  let n = 0
  for (let i = 0; i < data.length; i++) n += data[i]! * data[i]!
  n = Math.sqrt(n) || 1
  const out = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i]! / n
  return out
}

async function ensureModel() {
  if (processor && vision) return
  processor = await AutoProcessor.from_pretrained(SCAN_VISION_MODEL)
  vision = await CLIPVisionModelWithProjection.from_pretrained(SCAN_VISION_MODEL, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quantized: true,
  } as any)
}

async function embedBlob(blob: Blob): Promise<Float32Array> {
  await ensureModel()
  const url = URL.createObjectURL(blob)
  try {
    const image = await RawImage.read(url)
    const inputs = await processor!(image)
    const { image_embeds } = await vision!(inputs)
    const raw = image_embeds.data
    const data = raw instanceof Float32Array ? raw : new Float32Array(raw as ArrayLike<number>)
    return l2normalize(data)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function searchTopK(query: Float32Array, topK: number) {
  if (!index) return []
  const { dim, cards, vectors } = index
  const scored: Array<{
    cardId: string
    score: number
    name: string
    localId: string
    setId: string
    image?: string
  }> = []
  for (let i = 0; i < cards.length; i++) {
    const slice = vectors.subarray(i * dim, (i + 1) * dim)
    const score = cosine(query, slice)
    const c = cards[i]!
    scored.push({
      cardId: c.id,
      score,
      name: c.name,
      localId: c.localId,
      setId: c.setId,
      image: c.image,
    })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data as
    | { type: 'init'; index?: { dim: number; cards: IndexPayload['cards']; vectors: ArrayBuffer } }
    | { type: 'identify'; id: number; blob: Blob; topK?: number }
    | { type: 'status' }

  try {
    if (msg.type === 'status') {
      self.postMessage({
        type: 'status',
        ready: !!(processor && vision),
        indexSize: index?.cards.length ?? 0,
      })
      return
    }

    if (msg.type === 'init') {
      await ensureModel()
      if (msg.index) {
        index = {
          dim: msg.index.dim,
          cards: msg.index.cards,
          vectors: new Float32Array(msg.index.vectors),
        }
      }
      self.postMessage({
        type: 'ready',
        indexSize: index?.cards.length ?? 0,
        model: SCAN_VISION_MODEL,
      })
      return
    }

    if (msg.type === 'identify') {
      const t0 = performance.now()
      const query = await embedBlob(msg.blob)
      const hits = searchTopK(query, msg.topK ?? 5)
      self.postMessage({
        type: 'result',
        id: msg.id,
        hits,
        ms: Math.round(performance.now() - t0),
      })
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: 'id' in msg ? (msg as { id?: number }).id : undefined,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
