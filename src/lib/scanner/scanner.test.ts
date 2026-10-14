import { describe, expect, it, vi } from 'vitest'
import { aabb, warpQuad } from './geometry'
import { detectCardQuads, prepareCrops } from './detect'
import { fuse } from './fusion'
import { computeHashes, hashSimilarity } from './hash'
import { planInventoryCommit } from './inventoryCommit'
import { interpretLines, parseCollectorNumber, parseSetCode } from './ocrParse'
import { collectorNumberBands } from './numberZone'
import { identifyCrop } from './recognize'
import type { Raster, RecognizeDeps, ScanCard } from './types'

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

function fillRect(
  raster: Raster,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number],
) {
  const x0 = Math.max(0, x)
  const y0 = Math.max(0, y)
  const x1 = Math.min(raster.width, x + w)
  const y1 = Math.min(raster.height, y + h)
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * raster.width + xx) * 4
      raster.data[i] = color[0]
      raster.data[i + 1] = color[1]
      raster.data[i + 2] = color[2]
    }
  }
}

function boxOf(quads: ReturnType<typeof detectCardQuads>[number]) {
  return aabb(quads)
}

function card(id: string, localId = '25'): ScanCard {
  return { id, name: id, localId, setId: 'sv2', setName: 'Paldea', image: 'https://example.test/a.webp' }
}

describe('ocr parse (pokeum)', () => {
  it('reads a collector number with digit lookalikes', () => {
    expect(parseCollectorNumber('O25 / 193')).toEqual({ number: '25', total: 193 })
    expect(parseCollectorNumber('037/084')).toEqual({ number: '37', total: 84 })
    expect(parseCollectorNumber('037084')).toEqual({ number: '37', total: 84 })
    expect(parseCollectorNumber('08')).toEqual({ number: null, total: null })
    expect(parseCollectorNumber('0 0 4 0377084 0')).toEqual({ number: '37', total: 84 })
  })

  it('ignores stopwords when reading the set code', () => {
    expect(parseSetCode('EN HP PAL')).toBe('PAL')
    expect(parseSetCode('Illus. only')).toBeNull()
  })

  it('prefers the highest-confidence line that contains a fraction', () => {
    const obs = interpretLines([
      { text: 'noise', confidence: 0.9 },
      { text: '009/094', confidence: 0.4 },
    ])
    expect(obs.number).toBe('9')
    expect(obs.numberTotal).toBe(94)
    expect(obs.isUseful).toBe(true)
  })

  it('keeps 037/084 when another line is only a fragment', () => {
    const obs = interpretLines([
      { text: '08', confidence: 0.99 },
      { text: '037/084', confidence: 0.4 },
    ])
    expect(obs.number).toBe('37')
    expect(obs.numberTotal).toBe(84)
  })
})

describe('collector number bands', () => {
  it('covers the band where 037/084 sits on a loose crop', () => {
    const bands = collectorNumberBands()
    for (const y of [0.75, 0.82, 0.88]) {
      expect(bands.some((band) => band.top <= y && band.bottom >= y)).toBe(true)
    }
    expect(bands.some((band) => band.left === 0 && band.right <= 0.62 && band.top <= 0.78 && band.bottom >= 0.84)).toBe(true)
  })
})

describe('fusion (pokeum)', () => {
  it('marks a clear hash lead as confident', () => {
    const result = fuse({
      hash: [
        { cardId: 'a', score: 0.92 },
        { cardId: 'b', score: 0.4 },
      ],
    })
    expect(result.status).toBe('CONFIDENT')
    expect(result.candidates[0]?.cardId).toBe('a')
  })

  it('asks for review when the top two scores are close', () => {
    const result = fuse({
      hash: [
        { cardId: 'a', score: 0.9 },
        { cardId: 'b', score: 0.86 },
      ],
    })
    expect(result.status).toBe('UNCERTAIN')
  })

  it('rejects a weak top score', () => {
    const result = fuse({ hash: [{ cardId: 'a', score: 0.2 }] })
    expect(result.status).toBe('NO_MATCH')
  })

  it('lets a matching collector number break a visual tie', () => {
    const result = fuse(
      {
        hash: [
          { cardId: 'a', score: 0.7 },
          { cardId: 'b', score: 0.7 },
        ],
      },
      {
        rawText: '25/193',
        number: '25',
        numberTotal: 193,
        setCode: 'PAL',
        confidence: 1,
        isUseful: true,
      },
      new Set(['a']),
    )
    expect(result.status).toBe('CONFIDENT')
    expect(result.candidates[0]?.cardId).toBe('a')
  })

  it('returns no match when no signal ran', () => {
    expect(fuse({}).status).toBe('NO_MATCH')
  })
})

describe('perceptual hash', () => {
  it('matches an image with itself and separates a different pattern', () => {
    const left = solid(48, 64, [20, 20, 20])
    fillRect(left, 8, 10, 20, 30, [220, 40, 40])
    const same = solid(48, 64, [20, 20, 20])
    fillRect(same, 8, 10, 20, 30, [220, 40, 40])
    const other = solid(48, 64, [20, 20, 20])
    for (let y = 0; y < 64; y += 4) fillRect(other, 0, y, 48, 2, [240, 240, 240])
    const a = computeHashes(left)
    expect(hashSimilarity(a, computeHashes(same))).toBe(1)
    expect(hashSimilarity(a, computeHashes(other))).toBeLessThan(1)
  })
})

describe('card detection', () => {
  it('finds one card on a contrasting background', () => {
    const image = solid(400, 520, [12, 12, 12])
    fillRect(image, 40, 50, 220, 300, [240, 240, 240])
    const quads = detectCardQuads(image, { maxCards: 4, minAreaFraction: 0.05 })
    expect(quads.length).toBe(1)
    const box = boxOf(quads[0])
    expect(box.x).toBeGreaterThan(20)
    expect(box.x).toBeLessThan(70)
    expect(box.w).toBeGreaterThan(180)
    expect(box.h).toBeGreaterThan(250)
  })

  it('finds several separated cards in one photo', () => {
    const image = solid(860, 420, [16, 18, 20])
    fillRect(image, 30, 40, 200, 280, [230, 230, 230])
    fillRect(image, 320, 50, 200, 280, [210, 210, 220])
    fillRect(image, 610, 36, 200, 280, [200, 205, 210])
    const quads = detectCardQuads(image, { maxCards: 8, minAreaFraction: 0.02 })
    expect(quads.length).toBe(3)
  })

  it('ignores regions that are not card-shaped', () => {
    const image = solid(400, 400, [10, 10, 10])
    fillRect(image, 150, 150, 100, 100, [250, 250, 250])
    fillRect(image, 20, 180, 300, 36, [250, 250, 250])
    expect(detectCardQuads(image, { minAreaFraction: 0.02 }).length).toBe(0)
    expect(prepareCrops(image, 'multi')).toEqual([])
  })

  it('straightens a framed card into the canonical raster', () => {
    const image = solid(80, 110, [0, 180, 40])
    const warped = warpQuad(
      image,
      [
        { x: 0, y: 0 },
        { x: 79, y: 0 },
        { x: 79, y: 109 },
        { x: 0, y: 109 },
      ],
      40,
      56,
    )
    const center = (28 * 40 + 20) * 4
    expect(warped.data[center + 1]).toBeGreaterThan(100)
  })
})

describe('identifyCrop', () => {
  function deps(partial: Partial<RecognizeDeps>): RecognizeDeps {
    return {
      lang: 'pt',
      readLines: async () => [{ text: '025/193 PAL', confidence: 0.9 }],
      lookupByCollector: async () => [card('sv2-25')],
      loadReference: async () => solid(32, 48, [10, 120, 40]),
      ...partial,
    }
  }

  it('identifies a known card when the reference art matches', async () => {
    const art = solid(32, 48, [10, 120, 40])
    fillRect(art, 6, 8, 16, 20, [240, 220, 40])
    const result = await identifyCrop(art, deps({
      lookupByCollector: async () => [card('sv2-25')],
      loadReference: async () => art,
    }))
    expect(result.status).toBe('confident')
    expect(result.card?.id).toBe('sv2-25')
  })

  it('still lists catalog candidates when the photo hash is weak', async () => {
    const photo = solid(40, 64, [8, 8, 8])
    for (let y = 0; y < 64; y += 2) fillRect(photo, 0, y, 40, 1, [250, 250, 250])
    const official = solid(40, 64, [30, 90, 40])
    fillRect(official, 4, 6, 28, 30, [220, 40, 40])
    const result = await identifyCrop(photo, deps({
      readLines: async () => [{ text: '037/084', confidence: 0.8 }],
      lookupByCollector: async () => [card('pbl-37', '37')],
      loadReference: async () => official,
    }))
    expect(result.candidates.some((candidate) => candidate.id === 'pbl-37')).toBe(true)
    expect(result.status === 'uncertain' || result.status === 'confident').toBe(true)
  })

  it('stays uncertain when two cards are visually tied', async () => {
    const art = solid(32, 48, [10, 120, 40])
    const result = await identifyCrop(art, deps({
      lookupByCollector: async () => [card('sv2-25', '25'), card('swsh-25', '25')],
      loadReference: async () => art,
    }))
    expect(result.status).toBe('uncertain')
    expect(result.candidates).toHaveLength(2)
  })

  it('reports a miss when the collector number is not in the catalog', async () => {
    const result = await identifyCrop(solid(32, 48, [1, 2, 3]), deps({
      lookupByCollector: async () => [],
    }))
    expect(result.status).toBe('none')
    expect(result.reason).toBe('catalog-empty')
    expect(result.card).toBeNull()
  })

  it('asks for a manual choice when the number cannot be read and there is no visual index', async () => {
    const result = await identifyCrop(solid(32, 48, [1, 2, 3]), deps({
      readLines: async () => [{ text: '', confidence: 0 }],
      queryVisualIndex: async () => [],
    }))
    expect(result.status).toBe('none')
    expect(result.reason).toBe('no-number')
  })

  it('keeps the catalog match when the number is read, even if an index is loaded', async () => {
    const art = solid(24, 32, [12, 80, 20])
    const result = await identifyCrop(art, deps({
      lookupByCollector: async () => [card('sv2-25')],
      loadReference: async () => art,
      queryVisualIndex: async () => [{ card: card('other-1', '1'), score: 0.99 }],
    }))
    expect(result.card?.id).toBe('sv2-25')
  })

  it('uses the visual index when OCR finds nothing', async () => {
    const art = solid(24, 32, [9, 9, 40])
    const result = await identifyCrop(art, deps({
      readLines: async () => [{ text: 'sem numero', confidence: 0.2 }],
      queryVisualIndex: async () => [{ card: card('base-4', '4'), score: 0.96 }],
    }))
    expect(result.status).toBe('confident')
    expect(result.card?.id).toBe('base-4')
  })

  it('fails closed when the catalog lookup throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await identifyCrop(solid(16, 24, [1, 1, 1]), deps({
      lookupByCollector: async () => {
        throw new Error('offline')
      },
    }))
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('error')
  })
})

describe('inventory commit', () => {
  it('sums copies of the same card and ignores a repeated confirmation', () => {
    const lines = [
      { itemId: 'a', cardId: 'sv2-25', qty: 1 },
      { itemId: 'b', cardId: 'sv2-25', qty: 2 },
      { itemId: 'c', cardId: 'sv3-1', qty: 1 },
    ]
    const first = planInventoryCommit(lines, new Set())
    expect(first.adds).toEqual([
      { cardId: 'sv2-25', qty: 3 },
      { cardId: 'sv3-1', qty: 1 },
    ])
    const second = planInventoryCommit(lines, new Set(first.itemIds))
    expect(second.adds).toEqual([])
    expect(second.itemIds).toEqual([])
  })

  it('skips rows without a selected card', () => {
    const plan = planInventoryCommit(
      [
        { itemId: 'a', cardId: '', qty: 1 },
        { itemId: 'b', cardId: 'sv2-25', qty: 0 },
      ],
      new Set(),
    )
    expect(plan.adds).toEqual([])
  })
})
