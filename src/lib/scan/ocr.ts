import type { CardLang } from '../../types'
import { normalizeSetToken, resolveCandidates } from './cardLookup'
import type { OcrHit, ScanResolveResult } from './types'

type TesseractMod = typeof import('tesseract.js')

let workerPromise: Promise<import('tesseract.js').Worker> | null = null
let warmed = false

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TextDetectorLike = { detect: (input: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> }

let textDetector: TextDetectorLike | null | undefined

function getTextDetector(): TextDetectorLike | null {
  if (textDetector !== undefined) return textDetector
  // Chromium Text Detection API (Android Chrome, some desktop)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TD = (window as any).TextDetector
  if (typeof TD === 'function') {
    try {
      textDetector = new TD() as TextDetectorLike
      return textDetector
    } catch {
      textDetector = null
      return null
    }
  }
  textDetector = null
  return null
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract: TesseractMod = await import('tesseract.js')
      const worker = await Tesseract.createWorker('eng')
      await worker.setParameters({
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/.- ',
      })
      return worker
    })()
  }
  return workerPromise
}

/** Warm OCR engines while camera starts. */
export async function warmOcr(): Promise<void> {
  if (warmed) return
  warmed = true
  getTextDetector()
  try {
    const w = await getWorker()
    // Tiny blank recognize to load wasm/models
    const c = document.createElement('canvas')
    c.width = 32
    c.height = 16
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 32, 16)
    await w.recognize(c)
  } catch {
    // ignore warm failures
  }
}

function parseCollectorText(text: string): {
  setId?: string
  localId?: string
  setTotal?: number
} {
  const cleaned = text
    .replace(/[|\\]/g, '/')
    .replace(/O/g, '0') // common OCR confusion in numbers
    .replace(/\s+/g, ' ')
    .trim()

  const frac = cleaned.match(/\b(\d{1,3})\s*\/\s*(\d{2,3})\b/)
  const localFromFrac = frac?.[1]
  const setTotal = frac?.[2] ? Number(frac[2]) : undefined

  const setNum = cleaned.match(
    /\b([A-Za-z]{1,6}\d{0,2}(?:\.\d)?)\s*[-·.\s]?\s*0*(\d{1,3})\b/,
  )

  let setId: string | undefined
  let localId: string | undefined

  if (setNum) {
    setId = normalizeSetToken(setNum[1]!)
    localId = String(Number(setNum[2]))
  }
  if (!localId && localFromFrac) localId = String(Number(localFromFrac))

  if (!setId) {
    const tokens = cleaned.split(/[\s|/·._-]+/)
    for (const tok of tokens) {
      if (/^\d+$/.test(tok)) continue
      const s = normalizeSetToken(tok)
      if (s) {
        setId = s
        break
      }
    }
  }

  return { setId, localId, setTotal: Number.isFinite(setTotal) ? setTotal : undefined }
}

function parseNameHint(text: string): string | undefined {
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/[^A-Za-zÀ-ÿ'\- ]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3 && l.length <= 24)
    .filter((l) => !/^(basic|stage|pokemon|trainer|energy|hp|evolves)\b/i.test(l))

  const scored = lines
    .map((l) => {
      const words = l.split(' ').filter(Boolean)
      const ok = words.every((w) => /^[A-ZÀ-Ÿ][a-zà-ÿ'’-]+$/.test(w) || /^[A-Z]{1,3}$/.test(w))
      return { l, ok, len: l.length }
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.len - a.len)
  return scored[0]?.l
}

function sliceRegion(
  card: HTMLCanvasElement,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): HTMLCanvasElement {
  const sx = Math.floor(card.width * x0)
  const sy = Math.floor(card.height * y0)
  const sw = Math.max(8, Math.floor(card.width * (x1 - x0)))
  const sh = Math.max(8, Math.floor(card.height * (y1 - y0)))
  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, sw, sh)
  ctx.drawImage(card, sx, sy, sw, sh, 0, 0, sw, sh)
  return out
}

/** Upscale + binarize for OCR. */
function preprocessForOcr(src: HTMLCanvasElement, scale = 3, invert = false): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = Math.max(120, src.width * scale)
  out.height = Math.max(40, src.height * scale)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(src, 0, 0, out.width, out.height)
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d = img.data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) {
    sum += d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114
  }
  const mean = sum / (d.length / 4)
  const thr = mean * 0.92
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114
    let v = g < thr ? 0 : 255
    if (invert) v = 255 - v
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return out
}

async function ocrNative(canvas: HTMLCanvasElement): Promise<string | null> {
  const det = getTextDetector()
  if (!det) return null
  try {
    const results = await det.detect(canvas)
    const text = results.map((r) => r.rawValue).join(' ').trim()
    return text || null
  } catch {
    return null
  }
}

async function ocrTesseract(canvas: HTMLCanvasElement, digitsOnly = false): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker()
  if (digitsOnly) {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789/ ',
    })
  } else {
    await worker.setParameters({
      tessedit_char_whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/.- ',
    })
  }
  const result = await worker.recognize(canvas)
  return {
    text: result.data.text || '',
    confidence: (result.data.confidence ?? 0) / 100,
  }
}

async function readRegion(
  card: HTMLCanvasElement,
  region: [number, number, number, number],
  opts: { digitsOnly?: boolean; scale?: number } = {},
): Promise<{ text: string; confidence: number; engine: 'textDetector' | 'tesseract' }> {
  const raw = sliceRegion(card, ...region)
  const pre = preprocessForOcr(raw, opts.scale ?? 3)

  const native = await ocrNative(pre)
  if (native) {
    return { text: native, confidence: 0.75, engine: 'textDetector' }
  }

  const tess = await ocrTesseract(pre, opts.digitsOnly)
  return { ...tess, engine: 'tesseract' }
}

/**
 * Fast focused OCR: number (BR), set abbr (BL), name (top).
 */
export async function readCardOcr(cardCanvas: HTMLCanvasElement): Promise<OcrHit> {
  const [numOcr, setOcr, nameOcr] = await Promise.all([
    // bottom-right collector number
    readRegion(cardCanvas, [0.45, 0.82, 0.98, 0.98], { digitsOnly: true, scale: 3.5 }),
    // bottom-left set abbreviation / regulation
    readRegion(cardCanvas, [0.02, 0.82, 0.5, 0.98], { scale: 3 }),
    // top name band
    readRegion(cardCanvas, [0.08, 0.03, 0.75, 0.16], { scale: 2.5 }),
  ])

  const combined = `${setOcr.text} ${numOcr.text}`
  const parsed = parseCollectorText(combined)
  // Also parse number crop alone (often cleaner)
  const numOnly = parseCollectorText(numOcr.text)
  const setOnly = parseCollectorText(setOcr.text)

  const localId = parsed.localId ?? numOnly.localId
  const setTotal = parsed.setTotal ?? numOnly.setTotal
  const setId = parsed.setId ?? setOnly.setId ?? normalizeSetToken(setOcr.text.trim().split(/\s+/)[0] ?? '')
  const nameHint = parseNameHint(nameOcr.text)

  const engine = numOcr.engine
  const conf = Math.max(numOcr.confidence, setOcr.confidence) * (localId ? 1 : 0.5)

  return {
    setId,
    localId,
    setTotal,
    nameHint,
    cardId: setId && localId ? `${setId}-${localId}` : undefined,
    confidence: localId ? Math.max(conf, 0.55) : conf * 0.4,
    raw: `num:${numOcr.text.trim()} | set:${setOcr.text.trim()} | name:${nameHint ?? nameOcr.text.trim()}`,
    engine,
  }
}

export async function identifyFromCrop(
  lang: CardLang,
  cardCanvas: HTMLCanvasElement,
): Promise<ScanResolveResult> {
  const hit = await readCardOcr(cardCanvas)
  return resolveCandidates(lang, hit)
}

/** @deprecated */
export async function resolveOcrCard(lang: CardLang, hit: OcrHit) {
  const { ocr } = await resolveCandidates(lang, hit)
  return ocr
}

export async function terminateOcr() {
  if (!workerPromise) return
  try {
    const w = await workerPromise
    await w.terminate()
  } catch {
    // ignore
  }
  workerPromise = null
  warmed = false
}
