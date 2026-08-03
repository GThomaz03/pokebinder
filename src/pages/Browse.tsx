import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAllSetsMeta, type SetMeta } from '../api/cards/cardRepository'
import { baseCardId } from '../api/cardKeys'
import { SetSkeletonGrid } from '../components/Skeleton'
import { useInventory } from '../hooks/useInventory'
import { useLanguage } from '../hooks/useLanguage'
import './Browse.css'

export function BrowsePage() {
  const { lang } = useLanguage()
  const { entries } = useInventory()
  const [sets, setSets] = useState<SetMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void listAllSetsMeta(lang)
      .then((rows) => {
        if (!cancelled) setSets(rows)
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar as coleções.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lang])

  const ownedBySet = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const { key, qty } of entries) {
      if (qty <= 0) continue
      const id = baseCardId(key)
      const dash = id.lastIndexOf('-')
      if (dash <= 0) continue
      const setId = id.slice(0, dash)
      let bucket = map.get(setId)
      if (!bucket) {
        bucket = new Set()
        map.set(setId, bucket)
      }
      bucket.add(id)
    }
    return map
  }, [entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sets
    return sets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.abbreviation?.toLowerCase().includes(q) ||
        s.serieName?.toLowerCase().includes(q),
    )
  }, [sets, query])

  return (
    <div className="browse-page">
      <header className="browse-head">
        <div>
          <h1>Pesquisa</h1>
          <p>
            Todas as coleções do Pokémon TCG, das mais recentes às mais antigas. Abra uma
            coleção para ver as cartas e o que você já tem no repositório.
          </p>
        </div>
      </header>

      <div className="browse-toolbar">
        <h2>Coleções ({filtered.length})</h2>
        <input
          type="search"
          placeholder="Buscar coleção…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar coleção"
        />
      </div>

      {loading && <SetSkeletonGrid count={12} />}
      {error && <p className="browse-state">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="browse-state">Nenhuma coleção encontrada.</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="browse-set-grid">
          {filtered.map((row) => {
            const owned = ownedBySet.get(row.id)?.size ?? 0
            const total = Math.max(row.cardCount, owned)
            const pct = total ? Math.round((owned / total) * 100) : 0
            const abbr = row.abbreviation ?? row.id.toUpperCase().slice(0, 4)
            return (
              <Link
                key={row.id}
                to={`/pesquisa/${encodeURIComponent(row.id)}`}
                className="browse-set-card"
              >
                <header className="browse-set-top">
                  <span className="browse-set-code">{abbr}</span>
                  <strong className="browse-set-name" title={row.name}>
                    {row.name}
                  </strong>
                </header>
                <div className="browse-set-body">
                  <div className="browse-set-logo">
                    {row.logo ? (
                      <img src={row.logo} alt="" loading="lazy" />
                    ) : (
                      <span className="browse-set-logo-ph">{abbr}</span>
                    )}
                  </div>
                  <div className="browse-set-stats">
                    {row.releaseDate && (
                      <span className="browse-set-date">{formatSetDate(row.releaseDate)}</span>
                    )}
                    <span className="browse-set-frac">
                      {owned}/{total || '—'}
                    </span>
                    <span className="browse-set-pct">{pct}%</span>
                  </div>
                </div>
                <div className="browse-set-bar" aria-hidden>
                  <i style={{ width: `${pct}%` }} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatSetDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
