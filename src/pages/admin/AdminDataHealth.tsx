import { Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { useEffect, useState } from 'react'
import './AdminData.css'

type HealthIssue = {
  label: string
  count: number
}

export function AdminDataHealthPage() {
  const { isAdmin, loading: adminLoading } = useIsAdmin()
  const [issues, setIssues] = useState<HealthIssue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !isAdmin) return
    const db = supabase
    ;(async () => {
      const countTable = async (table: string) => {
        const { count } = await db.from(table).select('*', { count: 'exact', head: true })
        return count ?? 0
      }

      const { count: setsNoCards } = await db
        .from('set_coverage')
        .select('*', { count: 'exact', head: true })
        .gt('missing_cards', 0)

      const { count: cardsNoImage } = await db
        .from('cards')
        .select('*', { count: 'exact', head: true })
        .is('image_high_url', null)

      const { count: cardsNoNumber } = await db
        .from('cards')
        .select('*', { count: 'exact', head: true })
        .or('number.is.null,number.eq.')

      const { count: cardsNoSet } = await db
        .from('cards')
        .select('*', { count: 'exact', head: true })
        .is('set_id', null)

      const totalCards = await countTable('cards')
      const { count: withPt } = await db
        .from('card_translations')
        .select('*', { count: 'exact', head: true })
        .eq('language', 'pt-BR')
      const cardsNoPt = Math.max(0, totalCards - (withPt ?? 0))

      const { count: cardsNoSource } = await db
        .from('cards')
        .select('*', { count: 'exact', head: true })
        .or('source_id.is.null,source_id.eq.')

      setIssues([
        { label: 'Sets incompletos', count: setsNoCards ?? 0 },
        { label: 'Cartas sem imagem', count: cardsNoImage ?? 0 },
        { label: 'Cartas sem número', count: cardsNoNumber ?? 0 },
        { label: 'Cartas sem set', count: cardsNoSet ?? 0 },
        { label: 'Cartas sem tradução PT-BR', count: cardsNoPt },
        { label: 'Cartas sem source ID', count: cardsNoSource ?? 0 },
      ])
      setLoading(false)
    })()
  }, [isAdmin])

  if (adminLoading) return <p className="admin-muted">Verificando permissões…</p>
  if (!isAdmin) {
    return (
      <div className="admin-page">
        <h1>Saúde da base</h1>
        <p>Acesso restrito.</p>
      </div>
    )
  }

  const totalIssues = issues.reduce((s, i) => s + i.count, 0)

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Saúde da base</h1>
        <nav className="admin-nav">
          <Link to="/admin/data">Dashboard</Link>
        </nav>
      </header>
      {loading ? (
        <p className="admin-muted">Analisando…</p>
      ) : (
        <>
          <p className={`admin-status ${totalIssues === 0 ? 'ok' : 'warn'}`}>
            {totalIssues === 0 ? 'Nenhum problema detectado' : `${totalIssues} problemas potenciais`}
          </p>
          <ul className="admin-issues">
            {issues.map((i) => (
              <li key={i.label}>
                <strong>{i.count}</strong> — {i.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
