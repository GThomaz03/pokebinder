import { collectorNumberRasters } from './numberZone'
import { interpretLines } from './ocrParse'
import { PSM } from 'tesseract.js'
import { cardImageCandidates } from '../../api/images/imageProvider'
import type { CardLang } from '../../types'
import { lookupByCollector } from './catalog'
import { parseHashIndex, queryHashIndex, type HashIndexFile } from './hashIndex'
import type { HashFamily, Raster, RecognizeDeps, ScanCard, VisualIndexHit } from './types'

let indexPromise: Promise<HashIndexFile | null> | null = null
let sessionIndex: HashIndexFile | null = null
let workerPromise: Promise<import('tesseract.js').Worker> | null = null

/** Keeps a pilot index in memory for this tab. It is not written to the site. */
export function setSessionHashIndex(index: HashIndexFile | null) {
  sessionIndex = index
}

export function sessionHashIndexSize(): number {
  return sessionIndex?.cardCount ?? 0
}

export function rasterFromVideo(video: HTMLVideoElement): Raster {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx || !canvas.width) throw new Error('Câmera sem imagem')
  ctx.drawImage(video, 0, 0)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { data: image.data, width: image.width, height: image.height }
}

export function rasterFromBlob(blob: Blob): Promise<Raster> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || !canvas.width || !canvas.height) {
        URL.revokeObjectURL(url)
        reject(new Error('Imagem inválida'))
        return
      }
      ctx.drawImage(img, 0, 0)
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve({ data: image.data, width: image.width, height: image.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Imagem inválida'))
    }
    img.src = url
  })
}

export function rasterToObjectUrl(raster: Raster): string {
  const canvas = document.createElement('canvas')
  canvas.width = raster.width
  canvas.height = raster.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const copy = new Uint8ClampedArray(raster.data)
  ctx.putImageData(new ImageData(copy, raster.width, raster.height), 0, 0)
  return canvas.toDataURL('image/jpeg', 0.86)
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await import('tesseract.js')
      const worker = await Tesseract.createWorker('eng')
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/.- ',
      })
      return worker
    })()
  }
  return workerPromise
}

export async function warmScanner(): Promise<void> {
  try {
    const worker = await getWorker()
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 16
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 32, 16)
    await worker.recognize(canvas)
  } catch (err) {
    console.warn('[scanner] ocr warm failed', err)
  }
}

function rasterToCanvas(raster: Raster): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = raster.width
  canvas.height = raster.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0)
  return canvas
}

async function readLines(card: Raster): Promise<Array<{ text: string; confidence: number }>> {
  const worker = await getWorker()
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789/ ',
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  })
  const collected: Array<{ text: string; confidence: number }> = []
  for (const variant of collectorNumberRasters(card)) {
    collected.push(...(await recognizeRaster(worker, variant)))
    if (interpretLines(collected).number) return collected
  }
  return collected
}

export async function readCardNumber(card: Raster) {
  return interpretLines(await readLines(card))
}

async function recognizeRaster(
  worker: import('tesseract.js').Worker,
  raster: Raster,
): Promise<Array<{ text: string; confidence: number }>> {
  const result = await worker.recognize(rasterToCanvas(raster))
  const data = result.data as {
    text?: string
    confidence?: number
    lines?: Array<{ text?: string; confidence?: number }>
  }
  const lines = data.lines ?? []
  if (lines.length) return lines.map((line) => ({ text: line.text ?? '', confidence: line.confidence ?? 0 }))
  return [{ text: data.text ?? '', confidence: data.confidence ?? 0 }]
}

function loadPublishedIndex(): Promise<HashIndexFile | null> {
  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        const res = await fetch('/scan/hash-index.json')
        if (!res.ok) return null
        const parsed = parseHashIndex(await res.json())
        if (parsed) console.info('[scanner] hash index', { cards: parsed.cardCount, scope: parsed.scope ?? 'file' })
        return parsed
      } catch {
        return null
      }
    })()
  }
  return indexPromise
}

async function queryVisualIndex(hashes: HashFamily): Promise<VisualIndexHit[]> {
  const index = sessionIndex ?? (await loadPublishedIndex())
  if (!index?.cards.length) return []
  return queryHashIndex(index, hashes).map((hit) => ({ card: hit.card, score: hit.score }))
}

async function loadReference(card: ScanCard): Promise<Raster | null> {
  for (const url of cardImageCandidates(card.image, 'low')) {
    const raster = await loadImageUrl(url)
    if (raster) return raster
  }
  return null
}

function loadImageUrl(url: string): Promise<Raster | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = window.setTimeout(() => resolve(null), 8000)
    img.onload = () => {
      window.clearTimeout(timer)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || !canvas.width) {
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0)
      try {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
        resolve({ data: image.data, width: image.width, height: image.height })
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    img.src = url
  })
}

export function createScannerDeps(lang: CardLang): RecognizeDeps {
  return {
    lang,
    readLines,
    lookupByCollector,
    loadReference,
    queryVisualIndex,
  }
}
