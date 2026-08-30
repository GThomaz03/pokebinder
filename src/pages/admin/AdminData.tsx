import { Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { useAuth } from '../../hooks/useAuth'
import { useEffect, useState } from 'react'
import './AdminData.css'

type Stats = {
  cards: number
  sets: number
  series: number
  variants: number
  translations: number
  images: number
  lastSync: string | null
  syncStatus: string | null
  errors: number
}

export function AdminDataPage() {
  const { isAdmin, loading: adminLoading, loggedIn } = useIsAdmin()
  const { openAuth, user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !isAdmin) return
    ;(async () => {
      const count = async (table: string) => {
        const { count: c } = await supabase!.from(table).select('*', { count: 'exact', head: true })
        return c ?? 0
      }
      const [cards, sets, series, variants, translations, images] = await Promise.all([
        count('cards'),
        count('sets'),
        count('series'),
        count('card_variants'),
        count('card_translations'),
        count('card_images'),
      ])
      const { count: errors } = await supabase!
        .from('sync_errors')
        .select('*', { count: 'exact', head: true })
      const { data: job } = await supabase!
        .from('sync_jobs')
        .select('finished_at, status')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setStats({
        cards,
        sets,
        series,
        variants,
        translations,
        images,
        lastSync: job?.finished_at ?? null,
        syncStatus: job?.status ?? null,
        errors: errors ?? 0,
      })
      setLoading(false)
    })()
  }, [isAdmin])

  if (adminLoading) return <p className="admin-muted">Verificando permissões…</p>
  if (!isAdmin) {
    return (
      <div className="admin-page">
        <h1>Administração</h1>
        {!loggedIn ? (
          <>
            <p>Faça login para acessar o painel administrativo.</p>
            <button type="button" className="admin-login-btn" onClick={() => openAuth('signin')}>
              Entrar
            </button>
          </>
        ) : (
          <>
            <p>
              Acesso restrito para <strong>{user?.email ?? 'esta conta'}</strong>.
            </p>
            <p className="admin-hint">
              Se você acabou de receber permissão de admin, saia e entre novamente, ou recarregue
              esta página (F5).
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Base de cartas</h1>
        <nav className="admin-nav">
          <Link to="/admin/data/health">Saúde da base</Link>
        </nav>
      </header>
      {loading || !stats ? (
        <p className="admin-muted">Carregando estatísticas…</p>
      ) : (
        <div className="admin-grid">
          <Stat label="Cartas" value={stats.cards} />
          <Stat label="Sets" value={stats.sets} />
          <Stat label="Séries" value={stats.series} />
          <Stat label="Variantes" value={stats.variants} />
          <Stat label="Traduções" value={stats.translations} />
          <Stat label="Imagens" value={stats.images} />
        </div>
      )}
      {stats && (
        <section className="admin-section">
          <h2>Sincronização</h2>
          <p>
            Última sync:{' '}
            {stats.lastSync
              ? new Date(stats.lastSync).toLocaleString('pt-BR')
              : 'Nunca'}
          </p>
          <p>Status: {stats.syncStatus ?? '—'}</p>
          <p>Erros registrados: {stats.errors}</p>
          <p className="admin-hint">
            Importação via CLI: <code>npm run cards:import</code> · Sync:{' '}
            <code>npm run cards:sync</code>
          </p>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-value">{value.toLocaleString('pt-BR')}</span>
      <span className="admin-stat-label">{label}</span>
    </div>
  )
}
