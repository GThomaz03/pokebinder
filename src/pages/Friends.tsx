import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  followUser,
  getProfileByFriendCode,
  getProfileByUsername,
  initials,
  listFollowing,
  searchProfiles,
  type Profile,
} from '../lib/social'
import { useAuth } from '../hooks/useAuth'
import './Friends.css'

export function FriendsPage() {
  const { user, isAuthenticated, openAuth, requireAuth } = useAuth()
  const navigate = useNavigate()
  const [following, setFollowing] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      setFollowing(await listFollowing(user.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar amigos.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }
    void load()
  }, [isAuthenticated, load])

  async function addByCode(e: FormEvent) {
    e.preventDefault()
    if (!requireAuth() || !user) return
    const raw = code.trim()
    if (!raw) return
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      let profile =
        (await getProfileByFriendCode(raw)) ??
        (raw.startsWith('@')
          ? await getProfileByUsername(raw.slice(1))
          : await getProfileByUsername(raw))

      if (!profile) throw new Error('Nenhum treinador encontrado com esse código ou username.')
      if (profile.id === user.id) throw new Error('Esse é o seu próprio perfil.')

      await followUser(user.id, profile.id)
      setMessage(`Agora você segue ${profile.displayName || profile.username}.`)
      setCode('')
      await load()
      if (profile.username) navigate(`/u/${profile.username}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar.')
    } finally {
      setBusy(false)
    }
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault()
    if (!requireAuth()) return
    setBusy(true)
    setError(null)
    try {
      setResults(await searchProfiles(query))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na busca.')
    } finally {
      setBusy(false)
    }
  }

  async function followFromSearch(p: Profile) {
    if (!requireAuth() || !user) return
    if (p.id === user.id) return
    setBusy(true)
    try {
      await followUser(user.id, p.id)
      await load()
      setMessage(`Agora você segue ${p.displayName || p.username}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao seguir.')
    } finally {
      setBusy(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="friends-page friends-page--state">
        <h1>Amigos</h1>
        <p className="muted">Entre na conta para seguir treinadores e ver os fichários deles.</p>
        <button type="button" className="btn primary" onClick={() => openAuth('signin')}>
          Entrar
        </button>
      </div>
    )
  }

  return (
    <div className="friends-page">
      <header className="friends-hero">
        <p className="friends-eyebrow">Rede</p>
        <h1>Amigos</h1>
        <p>
          Adicione pelo <strong>código de amigo</strong> ou pelo link do perfil que alguém
          compartilhou com você (`/u/username`).
        </p>
      </header>

      <section className="friends-add">
        <h2>Adicionar por código</h2>
        <form className="friends-form" onSubmit={(e) => void addByCode(e)}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código ou @username"
            aria-label="Código de amigo ou username"
            autoCapitalize="characters"
          />
          <button type="submit" className="btn primary" disabled={busy || !code.trim()}>
            {busy ? '…' : 'Seguir'}
          </button>
        </form>
      </section>

      <section className="friends-add">
        <h2>Buscar</h2>
        <form className="friends-form" onSubmit={(e) => void onSearch(e)}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome ou username…"
            aria-label="Buscar treinadores"
          />
          <button type="submit" className="btn ghost" disabled={busy || !query.trim()}>
            Buscar
          </button>
        </form>
        {results.length > 0 && (
          <ul className="friends-list">
            {results.map((p) => (
              <li key={p.id}>
                <Link to={p.username ? `/u/${p.username}` : '#'} className="friends-row">
                  <span className="friends-avatar" aria-hidden>
                    {initials(p)}
                  </span>
                  <span>
                    <strong>{p.displayName || p.username}</strong>
                    {p.username && <small>@{p.username}</small>}
                  </span>
                </Link>
                {user && p.id !== user.id && (
                  <button
                    type="button"
                    className="btn ghost friends-follow-btn"
                    disabled={busy || following.some((f) => f.id === p.id)}
                    onClick={() => void followFromSearch(p)}
                  >
                    {following.some((f) => f.id === p.id) ? 'Seguindo' : 'Seguir'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && <p className="friends-ok">{message}</p>}
      {error && <p className="friends-error">{error}</p>}

      <section className="friends-following">
        <h2>Seguindo</h2>
        {loading ? (
          <p className="muted">Carregando…</p>
        ) : following.length === 0 ? (
          <p className="muted">Você ainda não segue ninguém. Peça o código de um amigo!</p>
        ) : (
          <ul className="friends-list">
            {following.map((p) => (
              <li key={p.id}>
                <Link to={p.username ? `/u/${p.username}` : '/amigos'} className="friends-row">
                  <span className="friends-avatar" aria-hidden>
                    {initials(p)}
                  </span>
                  <span>
                    <strong>{p.displayName || p.username}</strong>
                    {p.username && <small>@{p.username}</small>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
