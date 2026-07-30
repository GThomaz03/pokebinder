import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { joinByInviteToken } from '../lib/collabBinders'
import './CollabBinder.css'

export function CollabJoinPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, openAuth, requireAuth, user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !user || !token) return
    let cancelled = false
    setBusy(true)
    setError(null)
    joinByInviteToken(token)
      .then((id) => {
        if (!cancelled) navigate(`/collab/${id}`, { replace: true })
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Não foi possível entrar.')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, user, token, navigate])

  if (!isAuthenticated) {
    return (
      <div className="missing">
        <h1>Entrar no fichário compartilhado</h1>
        <p>Faça login para aceitar o convite.</p>
        <button type="button" className="btn primary" onClick={() => openAuth('signin')}>
          Entrar
        </button>
        <Link to="/">Cancelar</Link>
      </div>
    )
  }

  return (
    <div className="missing">
      <h1>Convite</h1>
      {busy && <p>Entrando no fichário…</p>}
      {error && (
        <>
          <p className="profile-error">{error}</p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (!requireAuth()) return
              setBusy(true)
              setError(null)
              void joinByInviteToken(token)
                .then((id) => navigate(`/collab/${id}`, { replace: true }))
                .catch((e) => setError(e instanceof Error ? e.message : 'Erro'))
                .finally(() => setBusy(false))
            }}
          >
            Tentar de novo
          </button>
          <Link to="/">Voltar</Link>
        </>
      )}
    </div>
  )
}
