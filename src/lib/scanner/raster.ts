import { INGEST_MAX_SIDE } from './constants'
import type { Raster } from './types'

export function capLongSide(raster: Raster, maxSide = INGEST_MAX_SIDE): Raster {
  const long = Math.max(raster.width, raster.height)
  if (long <= maxSide) return raster
  const scale = maxSide / long
  return resizeRaster(raster, Math.max(1, Math.round(raster.width * scale)), Math.max(1, Math.round(raster.height * scale)))
}

export function resizeRaster(raster: Raster, width: number, height: number): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  const xScale = raster.width / width
  const yScale = raster.height / height
  for (let y = 0; y < height; y++) {
    const sy = (y + 0.5) * yScale - 0.5
    const y0 = Math.max(0, Math.floor(sy))
    const y1 = Math.min(raster.height - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < width; x++) {
      const sx = (x + 0.5) * xScale - 0.5
      const x0 = Math.max(0, Math.floor(sx))
      const x1 = Math.min(raster.width - 1, x0 + 1)
      const fx = sx - x0
      const i = (y * width + x) * 4
      for (let c = 0; c < 4; c++) {
        const p00 = raster.data[(y0 * raster.width + x0) * 4 + c]
        const p10 = raster.data[(y0 * raster.width + x1) * 4 + c]
        const p01 = raster.data[(y1 * raster.width + x0) * 4 + c]
        const p11 = raster.data[(y1 * raster.width + x1) * 4 + c]
        data[i + c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy
      }
    }
  }
  return { data, width, height }
}

export function cropRaster(raster: Raster, x: number, y: number, w: number, h: number): Raster {
  const left = Math.max(0, Math.floor(x))
  const top = Math.max(0, Math.floor(y))
  const width = Math.max(1, Math.min(raster.width - left, Math.floor(w)))
  const height = Math.max(1, Math.min(raster.height - top, Math.floor(h)))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    const src = ((top + row) * raster.width + left) * 4
    data.set(raster.data.subarray(src, src + width * 4), row * width * 4)
  }
  return { data, width, height }
}

export function grayscale(raster: Raster): Float32Array {
  const out = new Float32Array(raster.width * raster.height)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = raster.data[p] * 0.299 + raster.data[p + 1] * 0.587 + raster.data[p + 2] * 0.114
  }
  return out
}

export function sampleBilinear(raster: Raster, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= raster.width - 1 || y >= raster.height - 1) {
    const cx = Math.max(0, Math.min(raster.width - 1, Math.round(x)))
    const cy = Math.max(0, Math.min(raster.height - 1, Math.round(y)))
    const i = (cy * raster.width + cx) * 4
    return [raster.data[i], raster.data[i + 1], raster.data[i + 2], raster.data[i + 3]]
  }
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const x1 = x0 + 1
  const y1 = y0 + 1
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const p00 = raster.data[(y0 * raster.width + x0) * 4 + c]
    const p10 = raster.data[(y0 * raster.width + x1) * 4 + c]
    const p01 = raster.data[(y1 * raster.width + x0) * 4 + c]
    const p11 = raster.data[(y1 * raster.width + x1) * 4 + c]
    out[c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy
  }
  return out
}
