/**
 * Multi-card localization.
 *
 * Pokeum finds one convex quad with OpenCV contours. This module keeps that
 * rule (area + 63:88 aspect) and returns every plausible quad, which is the
 * batch-crop idea from card-photo scanners. The unlicensed YOLO code from
 * Pokemon-Card-Scanning-Webapp is not included.
 */
import {
  CARD_ASPECT,
  CARD_HEIGHT_PX,
  CARD_WIDTH_PX,
  DETECT_MAX_SIDE,
  DETECT_MIN_AREA_MULTI,
  MAX_CARDS_PER_PHOTO,
} from './constants'
import { aabb, iou, isPlausibleCard, quadArea, warpQuad } from './geometry'
import { capLongSide, cropRaster, grayscale, resizeRaster } from './raster'
import type { Point, PreparedCrop, Raster } from './types'

type Options = {
  minAreaFraction?: number
  maxCards?: number
}

export function detectCardQuads(raster: Raster, options: Options = {}): Point[][] {
  const minArea = options.minAreaFraction ?? DETECT_MIN_AREA_MULTI
  const maxCards = options.maxCards ?? MAX_CARDS_PER_PHOTO
  const long = Math.max(raster.width, raster.height)
  const scale = long > DETECT_MAX_SIDE ? DETECT_MAX_SIDE / long : 1
  const working =
    scale === 1
      ? raster
      : resizeRaster(raster, Math.max(1, Math.round(raster.width * scale)), Math.max(1, Math.round(raster.height * scale)))

  const flood = floodQuads(working, minArea)
  const edges = edgeQuads(working, minArea)
  const merged = suppressOverlaps([...flood, ...edges])
  merged.sort((a, b) => quadArea(b) - quadArea(a))
  return merged.slice(0, maxCards).map((quad) => quad.map((p) => ({ x: p.x / scale, y: p.y / scale })))
}

export function prepareFramedCard(raster: Raster): Raster {
  const quads = detectCardQuads(raster, { minAreaFraction: 0.55, maxCards: 1 })
  const quad = quads[0]
  if (quad && quadArea(quad) / (raster.width * raster.height) >= 0.55) return warpQuad(raster, quad)
  return centerCropCard(raster)
}

export function prepareCrops(raster: Raster, mode: 'single' | 'multi'): PreparedCrop[] {
  const capped = capLongSide(raster)
  const quads = detectCardQuads(capped, {
    minAreaFraction: mode === 'single' ? 0.05 : DETECT_MIN_AREA_MULTI,
    maxCards: mode === 'single' ? 1 : MAX_CARDS_PER_PHOTO,
  })
  if (!quads.length) {
    if (mode === 'single') return [{ raster: centerCropCard(capped), quad: null }]
    return []
  }
  return quads.map((quad) => ({ raster: warpQuad(capped, quad), quad }))
}

export function centerCropCard(raster: Raster): Raster {
  let cropW = raster.width
  let cropH = Math.round(cropW / CARD_ASPECT)
  if (cropH > raster.height) {
    cropH = raster.height
    cropW = Math.round(cropH * CARD_ASPECT)
  }
  const x = (raster.width - cropW) / 2
  const y = (raster.height - cropH) / 2
  return resizeRaster(cropRaster(raster, x, y, cropW, cropH), CARD_WIDTH_PX, CARD_HEIGHT_PX)
}

function suppressOverlaps(quads: Point[][]): Point[][] {
  const kept: Point[][] = []
  const ranked = [...quads].sort((a, b) => quadArea(b) - quadArea(a))
  for (const quad of ranked) {
    if (kept.some((other) => iou(quad, other) > 0.45)) continue
    kept.push(quad)
  }
  return kept
}

function floodQuads(raster: Raster, minArea: number): Point[][] {
  const corners = cornerColors(raster)
  if (!corners) return []
  const [br, bg, bb] = corners
  const { width, height } = raster
  const fg = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < fg.length; i++, p += 4) {
    const dr = Math.abs(raster.data[p] - br)
    const dg = Math.abs(raster.data[p + 1] - bg)
    const db = Math.abs(raster.data[p + 2] - bb)
    if (Math.max(dr, dg, db) > 38) fg[i] = 1
  }
  const labels = labelMask(fg, width, height)
  return quadsFromLabels(labels, width, height, raster.width * raster.height, minArea)
}

function cornerColors(raster: Raster): [number, number, number] | null {
  const patches = [
    patch(raster, 0, 0),
    patch(raster, raster.width - 8, 0),
    patch(raster, 0, raster.height - 8),
    patch(raster, raster.width - 8, raster.height - 8),
  ]
  const avg: [number, number, number] = [0, 0, 0]
  for (const color of patches) {
    avg[0] += color[0] / 4
    avg[1] += color[1] / 4
    avg[2] += color[2] / 4
  }
  for (const color of patches) {
    if (Math.max(Math.abs(color[0] - avg[0]), Math.abs(color[1] - avg[1]), Math.abs(color[2] - avg[2])) > 42) {
      return null
    }
  }
  return avg
}

function patch(raster: Raster, x: number, y: number): [number, number, number] {
  const left = Math.max(0, Math.min(raster.width - 1, x))
  const top = Math.max(0, Math.min(raster.height - 1, y))
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let yy = top; yy < Math.min(raster.height, top + 8); yy++) {
    for (let xx = left; xx < Math.min(raster.width, left + 8); xx++) {
      const i = (yy * raster.width + xx) * 4
      r += raster.data[i]
      g += raster.data[i + 1]
      b += raster.data[i + 2]
      n++
    }
  }
  return [r / n, g / n, b / n]
}

function edgeQuads(raster: Raster, minArea: number): Point[][] {
  const gray = grayscale(raster)
  const { width, height } = raster
  const mag = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const gx =
        -gray[i - width - 1] + gray[i - width + 1]
        - 2 * gray[i - 1] + 2 * gray[i + 1]
        - gray[i + width - 1] + gray[i + width + 1]
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
        + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1]
      mag[i] = Math.hypot(gx, gy)
    }
  }
  const values = [...mag].filter((v) => v > 0).sort((a, b) => a - b)
  const threshold = values.length ? values[Math.floor(values.length * 0.82)] : 255
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mag.length; i++) if (mag[i] >= threshold && mag[i] > 24) mask[i] = 1
  dilate(mask, width, height)
  const labels = labelMask(mask, width, height)
  return quadsFromLabels(labels, width, height, width * height, minArea)
}

function dilate(mask: Uint8Array, width: number, height: number) {
  const src = mask.slice()
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (src[i] || src[i - 1] || src[i + 1] || src[i - width] || src[i + width]) mask[i] = 1
    }
  }
}

function labelMask(mask: Uint8Array, width: number, height: number): Int32Array {
  const labels = new Int32Array(width * height)
  let current = 0
  const stack: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue
    current++
    stack.push(start)
    labels[start] = current
    while (stack.length) {
      const i = stack.pop() as number
      const x = i % width
      const y = (i - x) / width
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x + 1 < width ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y + 1 < height ? i + width : -1,
      ]
      for (const n of neighbors) {
        if (n >= 0 && mask[n] && !labels[n]) {
          labels[n] = current
          stack.push(n)
        }
      }
    }
  }
  return labels
}

function quadsFromLabels(
  labels: Int32Array,
  width: number,
  height: number,
  frameArea: number,
  minArea: number,
): Point[][] {
  const counts = new Map<number, number>()
  for (const label of labels) {
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)
  const quads: Point[][] = []
  for (const [label] of ranked) {
    const points: Point[] = []
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x
        if (labels[i] !== label) continue
        if (
          labels[i - 1] !== label ||
          labels[i + 1] !== label ||
          labels[i - width] !== label ||
          labels[i + width] !== label
        ) {
          points.push({ x, y })
        }
      }
    }
    if (points.length < 4) continue
    const quad = minAreaRect(points)
    if (isPlausibleCard(quad, frameArea, minArea)) quads.push(quad)
  }
  return quads
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function minAreaRect(points: Point[]): Point[] {
  const hull = convexHull(points)
  if (hull.length < 3) {
    const box = aabb(points)
    return [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x + box.w, y: box.y + box.h },
      { x: box.x, y: box.y + box.h },
    ]
  }
  let bestArea = Number.POSITIVE_INFINITY
  let best: Point[] = hull.slice(0, 4)
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of hull) {
      const rx = p.x * cos + p.y * sin
      const ry = -p.x * sin + p.y * cos
      minX = Math.min(minX, rx)
      maxX = Math.max(maxX, rx)
      minY = Math.min(minY, ry)
      maxY = Math.max(maxY, ry)
    }
    const area = (maxX - minX) * (maxY - minY)
    if (area < bestArea) {
      bestArea = area
      const unrot = (rx: number, ry: number): Point => ({
        x: rx * cos - ry * sin,
        y: rx * sin + ry * cos,
      })
      best = [unrot(minX, minY), unrot(maxX, minY), unrot(maxX, maxY), unrot(minX, maxY)]
    }
  }
  return best
}
