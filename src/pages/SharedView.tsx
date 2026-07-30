import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CardImage } from '../components/CardImage'
import { fetchShareLink, type ShareLink } from '../lib/cloudStorage'
import { deckTotal } from '../lib/deckRules'
import { getPokedexName } from '../lib/binderUtils'
import type { Binder, Deck, Slot } from '../types'
import { gridCols } from '../types'
import './SharedView.css'

export function SharedViewPage() {
  const { token = '' } = useParams()
  const [link, setLink] = useState<ShareLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchShareLink(token)
      .then((data) => {
        if (cancelled) return
        if (!data) setError('Link inválido ou expirado.')
        else setLink(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return (
      <div className="shared-view">
        <p className="shared-status">Carregando compartilhamento…</p>
      </div>
    )
  }

  if (error || !link) {
    return (
      <div className="shared-view">
        <p className="shared-error">{error ?? 'Não encontrado.'}</p>
        <Link to="/" className="btn ghost">
          Ir para o app
        </Link>
      </div>
    )
  }

  return (
    <div className="shared-view">
      <header className="shared-header">
        <p className="shared-eyebrow">Compartilhado via PokéBinder</p>
        <h1>{link.title ?? 'Coleção'}</h1>
        <p className="shared-meta">
          {link.resourceType === 'binder' ? 'Fichário (somente leitura)' : 'Deck (somente leitura)'}
        </p>
        <Link to="/" className="btn primary">
          Criar o seu no PokéBinder
        </Link>
      </header>

      {link.resourceType === 'binder' ? (
        <SharedBinderView binder={link.snapshot as Binder} />
      ) : (
        <SharedDeckView deck={link.snapshot as Deck} />
      )}
    </div>
  )
}

function SharedBinderView({ binder }: { binder: Binder }) {
  const [spreadIndex, setSpreadIndex] = useState(0)
  const pages = binder.pages
  const totalSpreads = Math.max(1, Math.ceil(pages.length / 2))
  const leftIndex = spreadIndex * 2
  const leftPage = pages[leftIndex]
  const rightPage = pages[leftIndex + 1] ?? null
  const cols = gridCols(binder.grid)

  return (
    <section className="shared-binder">
      <div className="shared-spread-nav">
        <button
          type="button"
          className="btn ghost"
          disabled={spreadIndex <= 0}
          onClick={() => setSpreadIndex((i) => Math.max(0, i - 1))}
        >
          ← Anterior
        </button>
        <span>
          Páginas {leftIndex + 1}
          {rightPage ? `–${leftIndex + 2}` : ''} de {pages.length}
        </span>
        <button
          type="button"
          className="btn ghost"
          disabled={spreadIndex >= totalSpreads - 1}
          onClick={() => setSpreadIndex((i) => Math.min(totalSpreads - 1, i + 1))}
        >
          Próximo →
        </button>
      </div>

      <div className="shared-pages">
        {[leftPage, rightPage].filter(Boolean).map((page, pi) => (
          <div key={page!.id} className="shared-page">
            {page!.label && <h3>{page!.label}</h3>}
            <div
              className="shared-grid"
              style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            >
              {page!.slots.map((slot, si) => (
                <SharedSlot key={`${pi}-${si}`} slot={slot} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SharedSlot({ slot }: { slot: Slot }) {
  if (!slot) {
    return <div className="shared-slot empty" aria-hidden />
  }

  if (slot.type === 'pokedex') {
    const cardId = slot.topCardId
    return (
      <div className="shared-slot pokedex">
        {cardId ? (
          <CardImage cardId={cardId} alt={getPokedexName(slot.dexId)} />
        ) : (
          <span className="dex-label">#{String(slot.dexId).padStart(3, '0')}</span>
        )}
        <span className="dex-name">{getPokedexName(slot.dexId)}</span>
      </div>
    )
  }

  return (
    <div className="shared-slot card">
      <CardImage cardId={slot.cardId} alt="" />
    </div>
  )
}

function SharedDeckView({ deck }: { deck: Deck }) {
  const total = deckTotal(deck)
  const grouped = useMemo(() => {
    const map = new Map<string, typeof deck.cards>()
    for (const c of deck.cards) {
      const list = map.get(c.category) ?? []
      list.push(c)
      map.set(c.category, list)
    }
    return map
  }, [deck.cards])

  return (
    <section className="shared-deck">
      {deck.notes && <p className="shared-deck-notes">{deck.notes}</p>}
      <p className="shared-deck-total">{total}/60 cartas</p>
      {(['Pokemon', 'Trainer', 'Energy'] as const).map((cat) => {
        const cards = grouped.get(cat)
        if (!cards?.length) return null
        return (
          <div key={cat} className="shared-deck-group">
            <h2>{cat === 'Pokemon' ? 'Pokémon' : cat === 'Trainer' ? 'Treinadores' : 'Energias'}</h2>
            <ul>
              {cards.map((c) => (
                <li key={c.cardId}>
                  <span className="qty">{c.qty}×</span>
                  {c.image ? (
                    <img src={c.image} alt="" width={36} height={50} loading="lazy" />
                  ) : (
                    <CardImage cardId={c.cardId} alt="" />
                  )}
                  <span>{c.name}</span>
                  {c.setName && <span className="set">{c.setName}</span>}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
