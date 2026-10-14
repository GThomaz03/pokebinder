import { describe, expect, it } from 'vitest'
import { bitsToHex, computeHashes } from './hash'
import { mergeHashIndex, parseHashIndex, queryHashIndex, selectPilotSample } from './hashIndex'
import type { HashIndexCard } from './hashIndex'
import type { Raster } from './types'

function solid(width: number, height: number, color: [number, number, number]): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = color[0]
    data[i * 4 + 1] = color[1]
    data[i * 4 + 2] = color[2]
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

function cardFrom(id: string, raster: Raster, language = 'en', setId = 'sv3'): HashIndexCard {
  const hashes = computeHashes(raster)
  return {
    id,
    name: id,
    localId: '1',
    setId,
    language,
    phash: bitsToHex(hashes.phash),
    dhash: bitsToHex(hashes.dhash),
    phashR: bitsToHex(hashes.phashR),
    phashG: bitsToHex(hashes.phashG),
    phashB: bitsToHex(hashes.phashB),
  }
}

describe('hash index', () => {
  it('ranks the indexed art of the same image first', () => {
    const query = solid(32, 40, [20, 30, 40])
    for (let y = 8; y < 28; y++) {
      for (let x = 6; x < 22; x++) {
        const i = (y * 32 + x) * 4
        query.data[i] = 240
        query.data[i + 1] = 220
        query.data[i + 2] = 30
      }
    }
    const other = solid(32, 40, [20, 30, 40])
    for (let y = 0; y < 40; y += 4) {
      for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4
        other.data[i] = 230
        other.data[i + 1] = 230
        other.data[i + 2] = 230
      }
    }
    const index = {
      version: 1 as const,
      bits: 256,
      cardCount: 2,
      cards: [cardFrom('other', other), cardFrom('same', query)],
    }
    const hits = queryHashIndex(index, computeHashes(query), 2)
    expect(hits[0]?.card.id).toBe('same')
    expect(hits[0]?.score).toBe(1)
    expect(hits[1]?.score).toBeLessThan(1)
  })

  it('rejects an index without hashes', () => {
    expect(parseHashIndex({ version: 1, cards: [{ id: 'a' }] })).toBeNull()
    expect(parseHashIndex({ version: 2, cards: [] })).toBeNull()
  })

  it('merges new cards and replaces an existing id', () => {
    const art = solid(8, 8, [1, 2, 3])
    const first = cardFrom('a', art)
    const updated = { ...cardFrom('a', solid(8, 8, [9, 9, 9])), name: 'updated' }
    const extra = cardFrom('b', art)
    const merged = mergeHashIndex(
      { version: 1, bits: 256, cardCount: 1, scope: 'pilot', cards: [first] },
      [updated, extra],
    )
    expect(merged.cards.map((card) => card.id).sort()).toEqual(['a', 'b'])
    expect(merged.cards.find((card) => card.id === 'a')?.name).toBe('updated')
    expect(merged.cardCount).toBe(2)
  })
})

describe('pilot sample', () => {
  it('spreads a small sample across languages and sets', () => {
    const rows = []
    for (let i = 0; i < 40; i++) rows.push({ id: `en-${i}`, language: 'en', setId: 'sv3' })
    for (let i = 0; i < 10; i++) rows.push({ id: `pt-${i}`, language: 'pt-BR', setId: `me${i % 3}` })
    for (let i = 0; i < 8; i++) rows.push({ id: `ja-${i}`, language: 'ja', setId: 'sv1' })
    const sample = selectPilotSample(rows, 18, new Set(['en-0']), 4)
    expect(sample.some((row) => row.id === 'en-0')).toBe(false)
    expect(sample.filter((row) => row.language === 'pt-BR').length).toBeGreaterThan(0)
    expect(sample.filter((row) => row.language === 'ja').length).toBeGreaterThan(0)
    const enSv3 = sample.filter((row) => row.setId === 'sv3')
    expect(enSv3.length).toBeLessThanOrEqual(6)
    expect(sample.length).toBeLessThanOrEqual(18)
  })
})
