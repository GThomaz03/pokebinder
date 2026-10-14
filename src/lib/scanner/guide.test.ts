import { describe, expect, it } from 'vitest'
import { objectFitCoverCrop } from './guide'

describe('camera guide mapping', () => {
  it('keeps the guide when the video fills the element', () => {
    const box = objectFitCoverCrop(
      { width: 1000, height: 1000 },
      { width: 1000, height: 1000 },
      { x: 100, y: 80, w: 400, h: 560 },
    )
    expect(box.x).toBeCloseTo(100)
    expect(box.y).toBeCloseTo(80)
    expect(box.w).toBeCloseTo(400)
    expect(box.h).toBeCloseTo(560)
  })

  it('accounts for the sides hidden by object-fit cover', () => {
    const box = objectFitCoverCrop(
      { width: 1920, height: 1080 },
      { width: 400, height: 800 },
      { x: 0, y: 0, w: 400, h: 800 },
    )
    expect(box.y).toBeCloseTo(0)
    expect(box.h).toBeCloseTo(1080)
    expect(box.w).toBeLessThan(1920)
    expect(box.x).toBeGreaterThan(0)
  })
})
