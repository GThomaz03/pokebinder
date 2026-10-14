/**
 * Corner order, card plausibility and perspective warp.
 * The quad rules follow pokeum `app/vision/geometry.py` (MIT).
 */
import { CARD_ASPECT_MAX, CARD_ASPECT_MIN, CARD_HEIGHT_PX, CARD_WIDTH_PX } from './constants'
import { sampleBilinear } from './raster'
import type { Point, Raster } from './types'

export function orderCorners(points: Point[]): Point[] {
  const tl = points.reduce((a, b) => (a.x + a.y <= b.x + b.y ? a : b))
  const br = points.reduce((a, b) => (a.x + a.y >= b.x + b.y ? a : b))
  const tr = points.reduce((a, b) => (a.x - a.y >= b.x - b.y ? a : b))
  const bl = points.reduce((a, b) => (a.x - a.y <= b.x - b.y ? a : b))
  return [tl, tr, br, bl]
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function quadArea(quad: Point[]): number {
  const [tl, tr, br, bl] = orderCorners(quad)
  return Math.abs((tl.x * tr.y + tr.x * br.y + br.x * bl.y + bl.x * tl.y) - (tl.y * tr.x + tr.y * br.x + br.y * bl.x + bl.y * tl.x)) / 2
}

export function quadAspect(quad: Point[]): number {
  const [tl, tr, br, bl] = orderCorners(quad)
  const width = (dist(tl, tr) + dist(bl, br)) / 2
  const height = (dist(tl, bl) + dist(tr, br)) / 2
  if (height <= 1) return 0
  return width / height
}

export function isPlausibleCard(quad: Point[], frameArea: number, minAreaFraction: number): boolean {
  const area = quadArea(quad)
  if (frameArea <= 0 || area / frameArea < minAreaFraction) return false
  const aspect = quadAspect(quad)
  return aspect >= CARD_ASPECT_MIN && aspect <= CARD_ASPECT_MAX
}

export function aabb(quad: Point[]): { x: number; y: number; w: number; h: number } {
  const xs = quad.map((p) => p.x)
  const ys = quad.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function iou(a: Point[], b: Point[]): number {
  const aa = aabb(a)
  const bb = aabb(b)
  const x1 = Math.max(aa.x, bb.x)
  const y1 = Math.max(aa.y, bb.y)
  const x2 = Math.min(aa.x + aa.w, bb.x + bb.w)
  const y2 = Math.min(aa.y + aa.h, bb.y + bb.h)
  const iw = Math.max(0, x2 - x1)
  const ih = Math.max(0, y2 - y1)
  const inter = iw * ih
  const union = aa.w * aa.h + bb.w * bb.h - inter
  return union <= 0 ? 0 : inter / union
}

function solveLinear(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length
  const a = matrix.map((row, i) => [...row, vector[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    }
    if (Math.abs(a[pivot][col]) < 1e-9) return null
    if (pivot !== col) {
      const swap = a[col]
      a[col] = a[pivot]
      a[pivot] = swap
    }
    const div = a[col][col]
    for (let k = col; k <= n; k++) a[col][k] /= div
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = a[row][col]
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k]
    }
  }
  return a.map((row) => row[n])
}

function homography(src: Point[], dst: Point[]): number[] | null {
  const rows: number[][] = []
  const vec: number[] = []
  for (let i = 0; i < 4; i++) {
    const x = src[i].x
    const y = src[i].y
    const X = dst[i].x
    const Y = dst[i].y
    rows.push([x, y, 1, 0, 0, 0, -x * X, -y * X])
    vec.push(X)
    rows.push([0, 0, 0, x, y, 1, -x * Y, -y * Y])
    vec.push(Y)
  }
  const h = solveLinear(rows, vec)
  if (!h) return null
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

export function warpQuad(raster: Raster, quad: Point[], width = CARD_WIDTH_PX, height = CARD_HEIGHT_PX): Raster {
  const src = orderCorners(quad)
  const dest: Point[] = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ]
  const map = homography(dest, src)
  const data = new Uint8ClampedArray(width * height * 4)
  if (!map) return { data, width, height }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = map[6] * x + map[7] * y + map[8]
      const sx = (map[0] * x + map[1] * y + map[2]) / w
      const sy = (map[3] * x + map[4] * y + map[5]) / w
      const px = sampleBilinear(raster, sx, sy)
      const i = (y * width + x) * 4
      data[i] = px[0]
      data[i + 1] = px[1]
      data[i + 2] = px[2]
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}
