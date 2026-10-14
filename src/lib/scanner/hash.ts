/**
 * Perceptual hashes adapted from pokeum `app/signals/hashes.py` (MIT),
 * which uses ImageHash phash (DCT) and dhash. Both the query and any
 * generated index must use this module so the bits stay comparable.
 */
import { HASH_BITS, HASH_HIGH_FREQ, HASH_SIZE } from './constants'
import { grayscale, resizeRaster } from './raster'
import type { HashFamily, Raster } from './types'

const cosTables = new Map<number, Float64Array>()

function cosTable(n: number): Float64Array {
  const cached = cosTables.get(n)
  if (cached) return cached
  const table = new Float64Array(n * n)
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      table[k * n + i] = Math.cos((Math.PI * k * (2 * i + 1)) / (2 * n))
    }
  }
  cosTables.set(n, table)
  return table
}

function dct1d(input: Float64Array): Float64Array {
  const n = input.length
  const cos = cosTable(n)
  const out = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    let sum = 0
    const row = k * n
    for (let i = 0; i < n; i++) sum += input[i] * cos[row + i]
    out[k] = sum
  }
  return out
}

function phashFromGray(gray: Float32Array, width: number, height: number): Uint8Array {
  const resized = resizeRaster(grayToRaster(gray, width, height), HASH_SIZE * HASH_HIGH_FREQ, HASH_SIZE * HASH_HIGH_FREQ)
  const n = HASH_SIZE * HASH_HIGH_FREQ
  const pixels = grayscale(resized)
  const rows = new Float64Array(n * n)
  const src = new Float64Array(n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) src[x] = pixels[y * n + x]
    rows.set(dct1d(src), y * n)
  }
  const cols = new Float64Array(n * n)
  const column = new Float64Array(n)
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) column[y] = rows[y * n + x]
    const transformed = dct1d(column)
    for (let y = 0; y < n; y++) cols[y * n + x] = transformed[y]
  }
  const low = new Float64Array(HASH_BITS)
  let i = 0
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) low[i++] = cols[y * n + x]
  }
  const sorted = [...low].sort((a, b) => a - b)
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  const bits = new Uint8Array(HASH_BITS)
  for (let b = 0; b < HASH_BITS; b++) bits[b] = low[b] > median ? 1 : 0
  return bits
}

function grayToRaster(gray: Float32Array, width: number, height: number): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < gray.length; i++) {
    const v = Math.max(0, Math.min(255, gray[i]))
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

function channelRaster(raster: Raster, channel: number): Raster {
  const data = new Uint8ClampedArray(raster.width * raster.height * 4)
  for (let i = 0; i < raster.width * raster.height; i++) {
    const v = raster.data[i * 4 + channel]
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return { data, width: raster.width, height: raster.height }
}

function dhash(raster: Raster): Uint8Array {
  const resized = resizeRaster(raster, HASH_SIZE + 1, HASH_SIZE)
  const gray = grayscale(resized)
  const bits = new Uint8Array(HASH_BITS)
  let bit = 0
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      bits[bit++] = gray[y * (HASH_SIZE + 1) + x + 1] > gray[y * (HASH_SIZE + 1) + x] ? 1 : 0
    }
  }
  return bits
}

export function computeHashes(raster: Raster): HashFamily {
  const gray = grayscale(raster)
  return {
    phash: phashFromGray(gray, raster.width, raster.height),
    dhash: dhash(raster),
    phashR: phashFromGray(grayscale(channelRaster(raster, 0)), raster.width, raster.height),
    phashG: phashFromGray(grayscale(channelRaster(raster, 1)), raster.width, raster.height),
    phashB: phashFromGray(grayscale(channelRaster(raster, 2)), raster.width, raster.height),
  }
}

export function hamming(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length)
  let dist = 0
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) dist++
  return dist + Math.abs(a.length - b.length)
}

export function hashSimilarity(query: HashFamily, reference: HashFamily): number {
  const pairs: Array<[Uint8Array, Uint8Array]> = [
    [query.phash, reference.phash],
    [query.dhash, reference.dhash],
    [query.phashR, reference.phashR],
    [query.phashG, reference.phashG],
    [query.phashB, reference.phashB],
  ]
  let best = HASH_BITS
  for (const [a, b] of pairs) best = Math.min(best, hamming(a, b))
  return 1 - best / HASH_BITS
}

export function bitsToHex(bits: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    let nibble = 0
    for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (bits[i + b] ?? 0)
    hex += nibble.toString(16)
  }
  return hex
}

export function hexToBits(hex: string): Uint8Array {
  const bits = new Uint8Array(hex.length * 4)
  for (let i = 0; i < hex.length; i++) {
    const nibble = Number.parseInt(hex[i], 16)
    for (let b = 0; b < 4; b++) bits[i * 4 + b] = (nibble >> (3 - b)) & 1
  }
  return bits
}
