import { describe, expect, it } from 'vitest'
import {
  cardImageCandidates,
  inferMissingImageCandidates,
  isLegacyCatalogImage,
} from './imageProvider'

const STELLAR = 'https://assets.tcgdex.net/pt/sv/sv07/001'

describe('card images', () => {
  it('keeps a TCGdex asset base and expands it to a real file', () => {
    expect(isLegacyCatalogImage(STELLAR)).toBe(false)
    expect(cardImageCandidates(STELLAR, 'low')[0]).toBe(`${STELLAR}/low.webp`)
  })

  it('rejects the Scrydex card-back URL for a padded set id', () => {
    expect(isLegacyCatalogImage('https://images.scrydex.com/pokemon/sv07-001/small')).toBe(true)
    expect(isLegacyCatalogImage('https://images.scrydex.com/pokemon/sv7-1/small')).toBe(false)
  })

  it('does not offer the Scrydex placeholder before a real CDN for Coroa Estelar', () => {
    const urls = inferMissingImageCandidates({ cardId: 'sv07-001', localId: '001', name: 'Venusaur ex' })
    expect(urls[0]).toMatch(/images\.pokemontcg\.io\/sv7\/1\.png$/)
    expect(urls.some((url) => url.includes('/sv07-001/'))).toBe(false)
    expect(urls.some((url) => url === `${STELLAR}/low.webp`.replace('/pt/', '/en/'))).toBe(true)
  })
})
