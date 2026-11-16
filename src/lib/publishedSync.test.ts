import { describe, expect, it } from 'vitest'
import { resourcesToRepublish } from './publishedSync'

describe('resourcesToRepublish', () => {
  const published = [
    { resourceType: 'binder', resourceId: 'binder-1', title: 'Antigo' },
    { resourceType: 'deck', resourceId: 'deck-1', title: 'Deck' },
  ]
  const local = [
    { type: 'binder', id: 'binder-1', title: 'Novo', updatedAt: 20 },
    { type: 'binder', id: 'binder-2', title: 'Privado', updatedAt: 20 },
    { type: 'deck', id: 'deck-1', title: 'Deck', updatedAt: 5 },
  ]

  it('republishes a published binder whose local copy changed', () => {
    const due = resourcesToRepublish(published, local, new Map())
    expect(due.map((item) => item.id)).toEqual(['binder-1', 'deck-1'])
  })

  it('skips a copy that was already pushed at this revision', () => {
    const due = resourcesToRepublish(published, local, new Map([['deck:deck-1', 5]]))
    expect(due.map((item) => item.id)).toEqual(['binder-1'])
  })

  it('does not publish a binder that is not on the profile', () => {
    const due = resourcesToRepublish(published, local, new Map())
    expect(due.some((item) => item.id === 'binder-2')).toBe(false)
  })
})
