import { describe, expect, it } from 'vitest'
import { detectBasicEnergy } from './deckRules'

describe('detectBasicEnergy', () => {
  it('treats a normal fire energy as basic', () => {
    expect(
      detectBasicEnergy({ category: 'Energy', energyType: 'Normal', name: 'Energia de Fogo' }),
    ).toBe(true)
  })

  it('does not treat a special energy as basic just because the name says Energia', () => {
    expect(
      detectBasicEnergy({
        category: 'Energy',
        energyType: 'Especial',
        name: 'Energia Bumerangue',
      }),
    ).toBe(false)
  })
})
