import type { ScanBox, TrackedCard } from './types'

/** Official Pokémon card ratio (W/H). */
const CARD_ASPECT = 63 / 88
const ASPECT_TOLERANCE = 0.18
const YOLO_URL = '/scan/models/yolo11n-card.onnx'
const YOLO_INPUT = 640

/** Minimum fraction of the short frame side the card must cover. */
const MIN_SIDE_FRAC = 0.38
const MAX_SIDE_FRAC = 0.96

type OrtModule = typeof import('onnxruntime-web')

let ortPromise: Promise<OrtModule | null> | null = null
let yoloSession: import('onnxruntime-web').InferenceSession | null = null
let yoloTried = false
let nextTrackId = 1

function loadOrt(): Promise<OrtModule | null> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web')
      .then((m) => m)
      .catch(() => null)
  }
  return ortPromise
}

export async function initDetector(): Promise<{ mode: 'yolo' | 'contour' }> {
  if (yoloTried) return { mode: yoloSession ? 'yolo' : 'contour' }
  yoloTried = true
  try {
    const res = await fetch(YOLO_URL, { method: 'HEAD' })
    if (!res.ok) return { mode: 'contour' }
    const ort = await loadOrt()
    if (!ort) return { mode: 'contour' }
    yoloSession = await ort.InferenceSession.create(YOLO_URL, {
      executionProviders: ['wasm'],
    })
    return { mode: 'yolo' }
  } catch {
    yoloSession = null
    return { mode: 'contour' }
  }
}

export function iou(a: ScanBox, b: ScanBox): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}

/** How much of `inner` is covered by `outer`. */
function containment(inner: ScanBox, outer: ScanBox): number {
  const x1 = Math.max(inner.x, outer.x)
  const y1 = Math.max(inner.y, outer.y)
  const x2 = Math.min(inner.x + inner.w, outer.x + outer.w)
  const y2 = Math.min(inner.y + inner.h, outer.y + outer.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const area = inner.w * inner.h
  return area > 0 ? inter / area : 0
}

function clampBox(box: ScanBox, width: number, height: number): ScanBox {
  const x = Math.max(0, Math.min(box.x, width - 2))
  const y = Math.max(0, Math.min(box.y, height - 2))
  const w = Math.max(8, Math.min(box.w, width - x))
  const h = Math.max(8, Math.min(box.h, height - y))
  return { ...box, x, y, w, h }
}

function smoothBox(prev: ScanBox | null, next: ScanBox, alpha = 0.28): ScanBox {
  if (!prev) return next
  return {
    x: prev.x * (1 - alpha) + next.x * alpha,
    y: prev.y * (1 - alpha) + next.y * alpha,
    w: prev.w * (1 - alpha) + next.w * alpha,
    h: prev.h * (1 - alpha) + next.h * alpha,
    score: next.score,
  }
}

function boxCenterDist(a: ScanBox, b: ScanBox): number {
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  const bx = b.x + b.w / 2
  const by = b.y + b.h / 2
  return Math.hypot(ax - bx, ay - by)
}

/** Crop using video-native coordinates (box already in video pixel space). */
export function cropVideoBox(
  video: HTMLVideoElement,
  box: ScanBox,
  outW = 360,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const aspect = box.w / Math.max(1, box.h)
  canvas.width = outW
  canvas.height = Math.max(1, Math.round(outW / aspect))
  const ctx = canvas.getContext('2d')!
  const pad = 0.02
  const rx = Math.max(0, box.x - box.w * pad)
  const ry = Math.max(0, box.y - box.h * pad)
  const rw = Math.min(video.videoWidth - rx, box.w * (1 + pad * 2))
  const rh = Math.min(video.videoHeight - ry, box.h * (1 + pad * 2))
  ctx.drawImage(video, rx, ry, rw, rh, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Separable 5-tap blur to suppress fine artwork edges inside the card. */
function blurGray(src: Uint8Array, width: number, height: number): Uint8Array {
  const tmp = new Uint8Array(width * height)
  const out = new Uint8Array(width * height)
  const k = [1, 4, 6, 4, 1]
  const ksum = 16

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0
      for (let i = -2; i <= 2; i++) {
        const xx = Math.min(width - 1, Math.max(0, x + i))
        acc += src[y * width + xx]! * k[i + 2]!
      }
      tmp[y * width + x] = (acc / ksum) | 0
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0
      for (let i = -2; i <= 2; i++) {
        const yy = Math.min(height - 1, Math.max(0, y + i))
        acc += tmp[yy * width + x]! * k[i + 2]!
      }
      out[y * width + x] = (acc / ksum) | 0
    }
  }
  return out
}

function buildIntegral(src: Uint8Array | Float32Array, width: number, height: number): Float64Array {
  const integ = new Float64Array((width + 1) * (height + 1))
  for (let y = 1; y <= height; y++) {
    let row = 0
    for (let x = 1; x <= width; x++) {
      row += src[(y - 1) * width + (x - 1)]!
      integ[y * (width + 1) + x] = integ[(y - 1) * (width + 1) + x]! + row
    }
  }
  return integ
}

function rectSum(integ: Float64Array, width: number, x0: number, y0: number, x1: number, y1: number) {
  const W = width + 1
  x0 = Math.max(0, x0 | 0)
  y0 = Math.max(0, y0 | 0)
  x1 = Math.min(width, x1 | 0)
  y1 = Math.min(Math.floor(integ.length / W) - 1, y1 | 0)
  if (x1 <= x0 || y1 <= y0) return 0
  return integ[y1 * W + x1]! - integ[y0 * W + x1]! - integ[y1 * W + x0]! + integ[y0 * W + x0]!
}

/**
 * Detect the outer card rectangle.
 * Prefers large aspect-correct boxes with strong outer border + background contrast,
 * and penalizes busy interiors (artwork windows).
 */
function detectContour(
  imageData: ImageData,
  prior: ScanBox | null = null,
): ScanBox | null {
  const { width, height, data } = imageData
  const grayRaw = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grayRaw[p] = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) | 0
  }
  // Blur twice so internal art edges largely disappear; card silhouette remains.
  const gray = blurGray(blurGray(grayRaw, width, height), width, height)

  const mag = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const gx =
        -gray[i - width - 1]! +
        gray[i - width + 1]! -
        2 * gray[i - 1]! +
        2 * gray[i + 1]! -
        gray[i + width - 1]! +
        gray[i + width + 1]!
      const gy =
        -gray[i - width - 1]! -
        2 * gray[i - width]! -
        gray[i - width + 1]! +
        gray[i + width - 1]! +
        2 * gray[i + width]! +
        gray[i + width + 1]!
      mag[i] = Math.hypot(gx, gy)
    }
  }

  // Percentile-ish threshold from samples (keeps only strong silhouette edges)
  const samples: number[] = []
  const stride = Math.max(1, Math.floor((width * height) / 2500))
  for (let i = 0; i < mag.length; i += stride) samples.push(mag[i]!)
  samples.sort((a, b) => a - b)
  const thr = samples[Math.floor(samples.length * 0.82)]! * 1.15

  const edge = new Uint8Array(width * height)
  for (let i = 0; i < mag.length; i++) edge[i] = mag[i]! >= thr ? 1 : 0

  // Dilate edges slightly to reconnect broken card borders
  const dilated = new Uint8Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      dilated[i] =
        edge[i]! |
        edge[i - 1]! |
        edge[i + 1]! |
        edge[i - width]! |
        edge[i + width]!
          ? 1
          : 0
    }
  }

  const edgeInteg = buildIntegral(dilated, width, height)
  const grayInteg = buildIntegral(gray, width, height)

  const meanRect = (x0: number, y0: number, x1: number, y1: number) => {
    const area = Math.max(1, (x1 - x0) * (y1 - y0))
    return rectSum(grayInteg, width, x0, y0, x1, y1) / area
  }

  const edgeDensity = (x0: number, y0: number, x1: number, y1: number) => {
    const area = Math.max(1, (x1 - x0) * (y1 - y0))
    return rectSum(edgeInteg, width, x0, y0, x1, y1) / area
  }

  /** Strong edges on the thin outer ring; weak just outside; not too busy deep inside. */
  const scoreBox = (x: number, y: number, w: number, h: number): number => {
    const t = Math.max(2, Math.round(Math.min(w, h) * 0.035))
    const ring = edgeDensity(x, y, x + w, y + h) - edgeDensity(x + t, y + t, x + w - t, y + h - t)

    // Outer band (background around card)
    const o = Math.max(2, t + 2)
    const ox0 = Math.max(0, x - o)
    const oy0 = Math.max(0, y - o)
    const ox1 = Math.min(width, x + w + o)
    const oy1 = Math.min(height, y + h + o)
    const outerArea = Math.max(1, (ox1 - ox0) * (oy1 - oy0) - w * h)
    const outerEdges =
      (rectSum(edgeInteg, width, ox0, oy0, ox1, oy1) - rectSum(edgeInteg, width, x, y, x + w, y + h)) /
      outerArea

    // Interior (skip a thicker border) — artwork clutter penalty
    const pad = Math.max(4, Math.round(Math.min(w, h) * 0.12))
    const innerDens = edgeDensity(x + pad, y + pad, x + w - pad, y + h - pad)

    // Luminance contrast card vs outside (table)
    const innerMean = meanRect(x + t, y + t, x + w - t, y + h - t)
    const topMean = meanRect(x, Math.max(0, y - o), x + w, y)
    const botMean = meanRect(x, y + h, x + w, Math.min(height, y + h + o))
    const leftMean = meanRect(Math.max(0, x - o), y, x, y + h)
    const rightMean = meanRect(x + w, y, Math.min(width, x + w + o), y + h)
    const outerMean = (topMean + botMean + leftMean + rightMean) / 4
    const contrast = Math.min(1, Math.abs(innerMean - outerMean) / 48)

    // Size prior — critical to avoid locking onto art panels
    const areaFrac = (w * h) / (width * height)
    const sizePrior = Math.pow(Math.min(1, areaFrac / 0.35), 1.35)

    // Aspect prior
    const ratio = w / h
    const aspectErr = Math.abs(ratio - CARD_ASPECT) / CARD_ASPECT
    const aspectPrior = Math.max(0, 1 - aspectErr / ASPECT_TOLERANCE)

    // Prefer near frame center
    const cx = (x + w / 2) / width - 0.5
    const cy = (y + h / 2) / height - 0.5
    const centerPrior = 1 - Math.min(1, Math.hypot(cx, cy) * 1.6)

    // Tracking continuity
    let priorBoost = 1
    if (prior) {
      const ov = iou({ x, y, w, h, score: 0 }, prior)
      const sameScale = Math.min(w / prior.w, prior.w / w) * Math.min(h / prior.h, prior.h / h)
      priorBoost = 1 + ov * 0.85 + sameScale * 0.25
      // Strongly reject boxes nested inside the current track (inner art)
      if (containment({ x, y, w, h, score: 0 }, prior) > 0.85 && w * h < prior.w * prior.h * 0.85) {
        return -1
      }
    }

    // Border should be stronger than outside clutter
    const borderQuality = ring - outerEdges * 0.55 - innerDens * 0.35

    const score =
      (0.55 + borderQuality) *
      (0.35 + contrast) *
      sizePrior *
      (0.4 + 0.6 * aspectPrior) *
      (0.55 + 0.45 * centerPrior) *
      priorBoost

    return score
  }

  let best: ScanBox | null = null
  const shortSide = Math.min(width, height)
  const minSide = shortSide * MIN_SIDE_FRAC
  const maxSide = shortSide * MAX_SIDE_FRAC
  const step = Math.max(3, Math.floor(shortSide / 48))

  // When tracking, search mostly around the prior (faster + more stable)
  let xMin = 0
  let yMin = 0
  let xMax = width
  let yMax = height
  let hMin = minSide
  let hMax = maxSide
  if (prior) {
    const margin = Math.max(prior.w, prior.h) * 0.35
    xMin = Math.max(0, prior.x - margin)
    yMin = Math.max(0, prior.y - margin)
    xMax = Math.min(width, prior.x + prior.w + margin)
    yMax = Math.min(height, prior.y + prior.h + margin)
    hMin = Math.max(minSide, prior.h * 0.75)
    hMax = Math.min(maxSide, prior.h * 1.28)
  }

  for (let h = hMin; h <= hMax; h += step) {
    for (const aspectMul of [0.94, 1, 1.06]) {
      const w = h * CARD_ASPECT * aspectMul
      if (w < minSide || w > maxSide) continue
      if (Math.abs(w / h - CARD_ASPECT) > ASPECT_TOLERANCE) continue
      for (let y = yMin; y + h <= yMax; y += step) {
        for (let x = xMin; x + w <= xMax; x += step) {
          const score = scoreBox(x, y, w, h)
          if (!best || score > best.score) {
            best = { x, y, w, h, score }
          }
        }
      }
    }
  }

  // Local refine around best (half step)
  if (best) {
    const refineStep = Math.max(1, Math.floor(step / 2))
    let refined = best
    for (const dh of [-refineStep, 0, refineStep]) {
      for (const dw of [-refineStep, 0, refineStep]) {
        for (const dy of [-refineStep, 0, refineStep]) {
          for (const dx of [-refineStep, 0, refineStep]) {
            const w = best.w + dw
            const h = best.h + dh
            const x = best.x + dx
            const y = best.y + dy
            if (x < 0 || y < 0 || x + w > width || y + h > height) continue
            if (Math.abs(w / h - CARD_ASPECT) > ASPECT_TOLERANCE) continue
            const score = scoreBox(x, y, w, h)
            if (score > refined.score) refined = { x, y, w, h, score }
          }
        }
      }
    }
    best = refined
  }

  if (!best || best.score < 0.08) return null
  return best
}

async function detectYolo(
  video: HTMLVideoElement,
  processW: number,
  processH: number,
): Promise<ScanBox | null> {
  if (!yoloSession) return null
  const ort = await loadOrt()
  if (!ort) return null

  const canvas = document.createElement('canvas')
  canvas.width = YOLO_INPUT
  canvas.height = YOLO_INPUT
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(video, 0, 0, YOLO_INPUT, YOLO_INPUT)
  const { data } = ctx.getImageData(0, 0, YOLO_INPUT, YOLO_INPUT)
  const float = new Float32Array(3 * YOLO_INPUT * YOLO_INPUT)
  const plane = YOLO_INPUT * YOLO_INPUT
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    float[p] = data[i]! / 255
    float[p + plane] = data[i + 1]! / 255
    float[p + 2 * plane] = data[i + 2]! / 255
  }

  const inputName = yoloSession.inputNames[0]!
  const tensor = new ort.Tensor('float32', float, [1, 3, YOLO_INPUT, YOLO_INPUT])
  const out = await yoloSession.run({ [inputName]: tensor })
  const outName = yoloSession.outputNames[0]!
  const output = out[outName]!
  const arr = output.data as Float32Array
  const dims = output.dims

  let best: ScanBox | null = null
  const scaleX = processW / YOLO_INPUT
  const scaleY = processH / YOLO_INPUT

  if (dims.length === 3 && dims[1]! > dims[2]!) {
    const attrs = dims[1]!
    const n = dims[2]!
    for (let i = 0; i < n; i++) {
      const cx = arr[i]!
      const cy = arr[n + i]!
      const bw = arr[2 * n + i]!
      const bh = arr[3 * n + i]!
      let conf = 0
      for (let a = 4; a < attrs; a++) conf = Math.max(conf, arr[a * n + i]!)
      if (conf < 0.35) continue
      const box: ScanBox = {
        x: (cx - bw / 2) * scaleX,
        y: (cy - bh / 2) * scaleY,
        w: bw * scaleX,
        h: bh * scaleY,
        score: conf,
      }
      if (!best || box.score > best.score) best = box
    }
  } else if (dims.length === 3) {
    const n = dims[1]!
    const attrs = dims[2]!
    for (let i = 0; i < n; i++) {
      const base = i * attrs
      const cx = arr[base]!
      const cy = arr[base + 1]!
      const bw = arr[base + 2]!
      const bh = arr[base + 3]!
      let conf = 0
      for (let a = 4; a < attrs; a++) conf = Math.max(conf, arr[base + a]!)
      if (conf < 0.35) continue
      const box: ScanBox = {
        x: (cx - bw / 2) * scaleX,
        y: (cy - bh / 2) * scaleY,
        w: bw * scaleX,
        h: bh * scaleY,
        score: conf,
      }
      if (!best || box.score > best.score) best = box
    }
  }

  return best
}

export class CardTracker {
  private track: TrackedCard | null = null
  private lost = 0
  private processCanvas: HTMLCanvasElement | null = null
  /** Process-space prior for local search. */
  private priorProc: ScanBox | null = null

  reset() {
    this.track = null
    this.lost = 0
    this.priorProc = null
  }

  get current(): TrackedCard | null {
    return this.track
  }

  async update(video: HTMLVideoElement): Promise<TrackedCard | null> {
    if (video.readyState < 2 || !video.videoWidth) return this.track

    // Slightly higher res helps outer border vs art, still mobile-friendly
    const processW = 360
    const processH = Math.round((processW * video.videoHeight) / video.videoWidth)
    if (!this.processCanvas) this.processCanvas = document.createElement('canvas')
    const canvas = this.processCanvas
    canvas.width = processW
    canvas.height = processH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(video, 0, 0, processW, processH)

    let raw: ScanBox | null = null
    if (yoloSession) {
      raw = await detectYolo(video, processW, processH)
    }
    if (!raw) {
      const imageData = ctx.getImageData(0, 0, processW, processH)
      raw = detectContour(imageData, this.priorProc)
    }

    const scaleX = video.videoWidth / processW
    const scaleY = video.videoHeight / processH

    if (!raw) {
      this.lost++
      // Keep last box briefly so overlay doesn't flicker
      if (this.lost > 18) {
        this.track = null
        this.priorProc = null
      }
      return this.track
    }

    // Reject tiny detections relative to prior (inner art lock)
    if (this.priorProc) {
      const areaRatio = (raw.w * raw.h) / (this.priorProc.w * this.priorProc.h)
      const contained = containment(raw, this.priorProc)
      if (contained > 0.8 && areaRatio < 0.82) {
        this.lost++
        return this.track
      }
      // Reject jumps far away unless much larger / better score
      const dist = boxCenterDist(raw, this.priorProc)
      const maxDist = Math.max(this.priorProc.w, this.priorProc.h) * 0.55
      if (dist > maxDist && areaRatio < 1.15 && this.track && this.track.stableFrames > 6) {
        this.lost++
        return this.track
      }
    }

    const mapped: ScanBox = clampBox(
      {
        x: raw.x * scaleX,
        y: raw.y * scaleY,
        w: raw.w * scaleX,
        h: raw.h * scaleY,
        score: raw.score,
      },
      video.videoWidth,
      video.videoHeight,
    )

    this.lost = 0
    this.priorProc = raw

    if (this.track && iou(this.track.box, mapped) > 0.28) {
      // Size changes slower than position — avoids snapping to art panels
      const posAlpha = 0.4
      const sizeAlpha = 0.18
      const prev = this.track.box
      const smoothed: ScanBox = {
        x: prev.x * (1 - posAlpha) + mapped.x * posAlpha,
        y: prev.y * (1 - posAlpha) + mapped.y * posAlpha,
        w: prev.w * (1 - sizeAlpha) + mapped.w * sizeAlpha,
        h: prev.h * (1 - sizeAlpha) + mapped.h * sizeAlpha,
        score: mapped.score,
      }
      this.track = {
        ...this.track,
        box: smoothed,
        stableFrames: this.track.stableFrames + 1,
      }
    } else if (this.track && this.track.stableFrames >= 10) {
      // Locked track: ignore sudden unrelated boxes
      const contained = containment(mapped, this.track.box)
      if (contained > 0.7 || iou(this.track.box, mapped) < 0.15) {
        this.lost++
        return this.track
      }
      this.track = {
        box: smoothBox(this.track.box, mapped, 0.22),
        trackId: nextTrackId++,
        stableFrames: 1,
      }
    } else {
      this.track = {
        box: mapped,
        trackId: nextTrackId++,
        stableFrames: 1,
      }
    }
    return this.track
  }
}

/** Map video-space box to overlay (element) coordinates. */
export function boxToOverlay(box: ScanBox, video: HTMLVideoElement): ScanBox {
  const rect = video.getBoundingClientRect()
  const elW = rect.width
  const elH = rect.height
  const vW = video.videoWidth
  const vH = video.videoHeight
  if (!vW || !vH || !elW || !elH) return box

  const scale = Math.max(elW / vW, elH / vH)
  const dispW = vW * scale
  const dispH = vH * scale
  const offX = (elW - dispW) / 2
  const offY = (elH - dispH) / 2
  return {
    x: box.x * scale + offX,
    y: box.y * scale + offY,
    w: box.w * scale,
    h: box.h * scale,
    score: box.score,
  }
}
