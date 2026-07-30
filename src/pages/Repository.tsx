import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice, getCachedCard, hydrateCard } from '../api/prices'
import { baseCardId } from '../api/tcgdex'
import { AddCardsModal } from '../components/binder/AddCardsModal'
import { CardImage } from '../components/CardImage'
import { useInventory } from '../hooks/useInventory'
import { useLanguage } from '../hooks/useLanguage'
import './Repository.css'

export function RepositoryPage() {
  const { entries, setQty, addQty, setProgress } = useInventory()
  const { lang } = useLanguage()
  const [query, setQuery] = useState('')
  const [tick, setTick] = useState(0)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all(
      entries.slice(0, 60).map((e) => hydrateCard(lang, e.key)),
    ).then(() => {
      if (!cancelled) setTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [entries, lang])

  void tick

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => {
      const c = getCachedCard(baseCardId(e.key))
      return (
        e.key.toLowerCase().includes(q) ||
        c?.name.toLowerCase().includes(q) ||
        c?.setName?.toLowerCase().includes(q) ||
        c?.localId.toLowerCase().includes(q)
      )
    })
  }, [entries, query])

  const setRows = Object.entries(setProgress).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="repo-page">
      <header className="repo-head">
        <div>
          <Link to="/" className="back">
            ← Fichários
          </Link>
          <h1>Repositório de cartas</h1>
          <p>
            Quantidades que você possui. Cartas marcadas como “tenho” em fichários entram
            automaticamente com pelo menos 1.
          </p>
        </div>
        <div className="repo-head-actions">
          <button type="button" className="repo-add-btn" onClick={() => setAddOpen(true)}>
            + Adicionar cartas
          </button>
          <input
            type="search"
            placeholder="Buscar no repositório…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      <section className="set-progress">
        <h2>Progresso por coleção</h2>
        {setRows.length === 0 ? (
          <p className="muted">Ainda sem cartas no repositório.</p>
        ) : (
          <div className="set-grid">
            {setRows.map(([setId, prog]) => {
              const pct = prog.total ? Math.round((prog.owned / prog.total) * 100) : 0
              return (
                <article key={setId}>
                  <strong>{setId}</strong>
                  <span>
                    {prog.owned}/{prog.total}
                  </span>
                  <div className="bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="repo-list">
        <h2>Cartas ({filtered.length})</h2>
        <div className="cards">
          {filtered.map((e) => {
            const c = getCachedCard(baseCardId(e.key))
            return (
              <article key={e.key} className="repo-card">
                {c?.image ? <CardImage src={c.image} alt="" quality="high" /> : <div className="ph" />}
                <div>
                  <strong>{c?.name ?? e.key}</strong>
                  <span>
                    #{c?.localId ?? '—'}
                    {c?.setName ? ` · ${c.setName}` : ''}
                  </span>
                  <span className="price">
                    {c?.price ? formatPrice(c.price, 'cardmarket') : '—'}
                  </span>
                  <div className="qty">
                    <button type="button" onClick={() => addQty(e.key, -1)}>
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={e.qty}
                      onChange={(ev) => setQty(e.key, Number(ev.target.value) || 0)}
                    />
                    <button type="button" onClick={() => addQty(e.key, 1)}>
                      +
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <AddCardsModal
        open={addOpen}
        inventoryMode
        onClose={() => setAddOpen(false)}
        onAdd={(cardIds) => {
          for (const id of cardIds) addQty(id, 1)
        }}
      />
    </div>
  )
}
