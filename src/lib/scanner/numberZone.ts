import { cropRaster, resizeRaster } from './raster'
import type { Raster } from './types'

export type FractionBand = {
  left: number
  top: number
  right: number
  bottom: number
}

/** Overlapping windows on the lower part of the card. The first ones sit where 037/084 appears in a loose photo. */
export function collectorNumberBands(): FractionBand[] {
  const height = 0.1
  const starts = [0.76, 0.72, 0.8, 0.84, 0.68, 0.88, 0.92]
  const bands: FractionBand[] = []
  for (const top of starts) {
    const bottom = Math.min(1, top + height)
    bands.push({ left: 0, top, right: 0.62, bottom })
    bands.push({ left: 0, top, right: 1, bottom })
  }
  return bands
}

/** Grayscale enlargements of each band. Binary threshold is omitted so thin digits stay intact. */
export function collectorNumberRasters(card: Raster): Raster[] {
  const out: Raster[] = []
  for (const band of collectorNumberBands()) {
    const zone = cropFraction(card, band)
    if (zone.width < 8 || zone.height < 8) continue
    const scaled = resizeRaster(zone, Math.max(360, zone.width * 4), Math.max(72, zone.height * 4))
    out.push(stretchContrast(grayscaleRaster(scaled)))
  }
  return out
}

function cropFraction(raster: Raster, band: FractionBand): Raster {
  const x = raster.width * band.left
  const y = raster.height * band.top
  return cropRaster(raster, x, y, raster.width * (band.right - band.left), raster.height * (band.bottom - band.top))
}

function grayscaleRaster(raster: Raster): Raster {
  const data = new Uint8ClampedArray(raster.data.length)
  for (let i = 0; i < raster.width * raster.height; i++) {
    const v = raster.data[i * 4] * 0.299 + raster.data[i * 4 + 1] * 0.587 + raster.data[i * 4 + 2] * 0.114
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return { data, width: raster.width, height: raster.height }
}

function stretchContrast(raster: Raster): Raster {
  let min = 255
  let max = 0
  for (let i = 0; i < raster.width * raster.height; i++) {
    const v = raster.data[i * 4]
    if (v < min) min = v
    if (v > max) max = v
  }
  const scale = max > min ? 255 / (max - min) : 1
  const data = new Uint8ClampedArray(raster.data.length)
  for (let i = 0; i < raster.width * raster.height; i++) {
    const v = (raster.data[i * 4] - min) * scale
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return { data, width: raster.width, height: raster.height }
}
