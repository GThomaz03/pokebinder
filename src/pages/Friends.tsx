import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  followUser,
  getProfileByFriendCode,
  getProfileByUsername,
  initials,
  listFollowers,
  listFollowing,
  searchProfiles,
  unfollowUser,
  type Profile,
} from '../lib/social'
import { useAuth } from '../hooks/useAuth'
import { Skeleton } from '../components/Skeleton'
import './Friends.css'

export function FriendsPage() {
  const { user, isAuthenticated, openAuth, requireAuth } = useAuth()
  const navigate = useNavigate()
  const [following, setFollowing] = useState<Profile[]>([])
  const [followers, setFollowers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const followingIds = useMemo(() => new Set(following.map((p) => p.id)), [following])
  const followerIds = useMemo(() => new Set(followers.map((p) => p.id)), [followers])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [nextFollowing, nextFollowers] = await Promise.all([
        listFollowing(user.id),
        listFollowers(user.id),
      ])
      setFollowing(nextFollowing)
      setFollowers(nextFollowers)
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

  async function followPerson(p: Profile, label = 'seguir') {
    if (!requireAuth() || !user) return
    if (p.id === user.id) return
    setBusyId(p.id)
    setMessage(null)
    setError(null)
    try {
      await followUser(user.id, p.id)
      await load()
      setMessage(
        label === 'voltar'
          ? `Você seguiu ${p.displayName || p.username} de volta.`
          : `Agora você segue ${p.displayName || p.username}.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao seguir.')
    } finally {
      setBusyId(null)
    }
  }

  async function unfollowPerson(p: Profile) {
    if (!requireAuth() || !user) return
    setBusyId(p.id)
    setMessage(null)
    setError(null)
    try {
      await unfollowUser(user.id, p.id)
      await load()
      setMessage(`Você deixou de seguir ${p.displayName || p.username}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deixar de seguir.')
    } finally {
      setBusyId(null)
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
          compartilhou com você (`/u/username`). Veja quem te segue e siga de volta.
        </p>
      </header>

      <div className="friends-search-row">
        <section className="friends-add">
          <h2>Buscar por código</h2>
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
          <h2>Buscar por nome</h2>
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
        </section>
      </div>

      {results.length > 0 && (
        <section className="friends-add">
          <h2>Resultados</h2>
          <ul className="friends-list">
            {results.map((p) => (
              <li key={p.id}>
                <Link to={p.username ? `/u/${p.username}` : '#'} className="friends-row">
                  <span className={`friends-avatar${p.avatarUrl ? ' friends-avatar--photo' : ''}`} aria-hidden>
                    {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p)}
                  </span>
                  <span>
                    <span className="friends-name-line">
                      <strong>{p.displayName || p.username}</strong>
                      {followerIds.has(p.id) && (
                        <span className="friends-badge">Te segue</span>
                      )}
                    </span>
                    {p.username && <small>@{p.username}</small>}
                  </span>
                </Link>
                {user && p.id !== user.id && (
                  <button
                    type="button"
                    className="btn ghost friends-follow-btn"
                    disabled={busyId === p.id}
                    onClick={() =>
                      void (
                        followingIds.has(p.id)
                          ? unfollowPerson(p)
                          : followPerson(p)
                      )
                    }
                  >
                    {busyId === p.id
                      ? '…'
                      : followingIds.has(p.id)
                        ? 'Deixar de seguir'
                        : followerIds.has(p.id)
                          ? 'Seguir de volta'
                          : 'Seguir'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {message && <p className="friends-ok">{message}</p>}
      {error && <p className="friends-error">{error}</p>}

      <div className="friends-lists-row">
        <section className="friends-following">
          <h2>Seguidores {followers.length > 0 ? `(${followers.length})` : ''}</h2>
          {loading ? (
            <div className="sk-friends-list" aria-busy aria-label="Carregando">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="sk-friends-row">
                  <Skeleton className="sk-avatar-sm" />
                  <div className="sk-result-meta">
                    <Skeleton className="sk-line sk-line--title" />
                    <Skeleton className="sk-line sk-line--meta" />
                  </div>
                </div>
              ))}
            </div>
          ) : followers.length === 0 ? (
            <p className="muted">Ninguém te segue ainda. Compartilhe seu código de amigo!</p>
          ) : (
            <ul className="friends-list">
              {followers.map((p) => {
                const already = followingIds.has(p.id)
                return (
                  <li key={p.id}>
                    <Link
                      to={p.username ? `/u/${p.username}` : '/amigos'}
                      className="friends-row"
                    >
                      <span className={`friends-avatar${p.avatarUrl ? ' friends-avatar--photo' : ''}`} aria-hidden>
                        {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p)}
                      </span>
                      <span>
                        <span className="friends-name-line">
                          <strong>{p.displayName || p.username}</strong>
                          <span className="friends-badge">Te segue</span>
                        </span>
                        {p.username && <small>@{p.username}</small>}
                      </span>
                    </Link>
                    <button
                      type="button"
                      className={`btn friends-follow-btn ${already ? 'ghost' : 'primary'}`}
                      disabled={busyId === p.id}
                      onClick={() =>
                        void (already ? unfollowPerson(p) : followPerson(p, 'voltar'))
                      }
                    >
                      {busyId === p.id
                        ? '…'
                        : already
                          ? 'Deixar de seguir'
                          : 'Seguir de volta'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="friends-following">
          <h2>Seguindo {following.length > 0 ? `(${following.length})` : ''}</h2>
          {loading ? (
            <div className="sk-friends-list" aria-busy aria-label="Carregando">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="sk-friends-row">
                  <Skeleton className="sk-avatar-sm" />
                  <div className="sk-result-meta">
                    <Skeleton className="sk-line sk-line--title" />
                    <Skeleton className="sk-line sk-line--meta" />
                  </div>
                </div>
              ))}
            </div>
          ) : following.length === 0 ? (
            <p className="muted">Você ainda não segue ninguém. Peça o código de um amigo!</p>
          ) : (
            <ul className="friends-list">
              {following.map((p) => (
                <li key={p.id}>
                  <Link to={p.username ? `/u/${p.username}` : '/amigos'} className="friends-row">
                    <span className={`friends-avatar${p.avatarUrl ? ' friends-avatar--photo' : ''}`} aria-hidden>
                      {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p)}
                    </span>
                    <span>
                      <span className="friends-name-line">
                        <strong>{p.displayName || p.username}</strong>
                        {followerIds.has(p.id) && (
                          <span className="friends-badge">Te segue</span>
                        )}
                      </span>
                      {p.username && <small>@{p.username}</small>}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="btn ghost friends-follow-btn"
                    disabled={busyId === p.id}
                    onClick={() => void unfollowPerson(p)}
                  >
                    {busyId === p.id ? '…' : 'Deixar de seguir'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
