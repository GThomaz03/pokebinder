import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  followUser,
  getMyProfile,
  getProfileByUsername,
  initials,
  isFollowing,
  listPublishedByUser,
  profileUrl,
  unfollowUser,
  updateMyProfile,
  type Profile,
  type PublishedResource,
} from '../lib/social'
import { useAuth } from '../hooks/useAuth'
import './Profile.css'

export function MyProfilePage() {
  const { user, isAuthenticated, openAuth, requireAuth } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [published, setPublished] = useState<PublishedResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [p, pubs] = await Promise.all([getMyProfile(user.id), listPublishedByUser(user.id)])
      setProfile(p)
      setPublished(pubs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar perfil.')
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

  async function copy(kind: 'link' | 'code', value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 2000)
  }

  if (!isAuthenticated) {
    return (
      <div className="profile-page profile-page--state">
        <h1>Seu perfil</h1>
        <p className="muted">Entre na conta para editar o perfil, código de amigo e publicações.</p>
        <button type="button" className="btn primary" onClick={() => openAuth('signin')}>
          Entrar
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="profile-page profile-page--state">
        <p className="muted">Carregando perfil…</p>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="profile-page profile-page--state">
        <p className="profile-error">{error ?? 'Perfil não encontrado.'}</p>
        <button type="button" className="btn ghost" onClick={() => void load()}>
          Tentar de novo
        </button>
      </div>
    )
  }

  const publicLink = profile.username ? profileUrl(profile.username) : null

  return (
    <div className="profile-page">
      <ProfileHeader
        profile={profile}
        isOwn
        onEdit={() => setEditing(true)}
        actions={
          <>
            {publicLink && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => void copy('link', publicLink)}
              >
                {copied === 'link' ? 'Link copiado!' : 'Copiar link do perfil'}
              </button>
            )}
            {profile.friendCode && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => void copy('code', profile.friendCode!)}
              >
                {copied === 'code' ? 'Código copiado!' : `Código: ${profile.friendCode}`}
              </button>
            )}
            {profile.username && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => navigate(`/u/${profile.username}`)}
              >
                Ver público
              </button>
            )}
          </>
        }
      />

      <PublishedGrid items={published} empty="Nada publicado ainda. Publique um fichário ou deck na lista." />

      {editing && (
        <ProfileEditModal
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={(p) => {
            setProfile(p)
            setEditing(false)
          }}
          requireAuth={requireAuth}
        />
      )}
    </div>
  )
}

export function PublicProfilePage() {
  const { username = '' } = useParams()
  const { user, isAuthenticated, requireAuth } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [published, setPublished] = useState<PublishedResource[]>([])
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOwn = Boolean(user && profile && user.id === profile.id)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getProfileByUsername(username)
      .then(async (p) => {
        if (cancelled) return
        if (!p || (!p.isPublic && (!user || user.id !== p.id))) {
          setError('Perfil não encontrado ou privado.')
          setProfile(null)
          return
        }
        setProfile(p)
        const pubs = await listPublishedByUser(p.id)
        if (cancelled) return
        setPublished(pubs)
        if (user && user.id !== p.id) {
          setFollowing(await isFollowing(user.id, p.id))
        }
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
  }, [username, user])

  async function toggleFollow() {
    if (!requireAuth() || !user || !profile || isOwn) return
    setBusy(true)
    try {
      if (following) {
        await unfollowUser(user.id, profile.id)
        setFollowing(false)
      } else {
        await followUser(user.id, profile.id)
        setFollowing(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao seguir.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="profile-page profile-page--state">
        <p className="muted">Carregando…</p>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="profile-page profile-page--state">
        <p className="profile-error">{error ?? 'Não encontrado.'}</p>
        <Link to="/" className="btn ghost">
          Voltar
        </Link>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <ProfileHeader
        profile={profile}
        isOwn={isOwn}
        actions={
          isOwn ? (
            <Link to="/perfil" className="btn ghost">
              Editar perfil
            </Link>
          ) : (
            <button
              type="button"
              className={`btn ${following ? 'ghost' : 'primary'}`}
              disabled={busy || !isAuthenticated}
              onClick={() => void toggleFollow()}
            >
              {following ? 'Deixar de seguir' : 'Seguir'}
            </button>
          )
        }
      />
      <PublishedGrid items={published} empty="Este treinador ainda não publicou fichários." />
    </div>
  )
}

function ProfileHeader({
  profile,
  isOwn,
  onEdit,
  actions,
}: {
  profile: Profile
  isOwn?: boolean
  onEdit?: () => void
  actions?: ReactNode
}) {
  return (
    <header className="profile-hero">
      <div className="profile-avatar" aria-hidden>
        {initials(profile)}
      </div>
      <div className="profile-hero-copy">
        <p className="profile-eyebrow">{isOwn ? 'Seu perfil' : 'Treinador'}</p>
        <h1>{profile.displayName || profile.username || 'Sem nome'}</h1>
        {profile.username && <p className="profile-username">@{profile.username}</p>}
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
        {profile.friendCode && (
          <p className="profile-code">
            Código de amigo: <strong>{profile.friendCode}</strong>
          </p>
        )}
        <div className="profile-actions">
          {isOwn && onEdit && (
            <button type="button" className="btn primary" onClick={onEdit}>
              Editar
            </button>
          )}
          {actions}
        </div>
      </div>
    </header>
  )
}

function PublishedGrid({
  items,
  empty,
}: {
  items: PublishedResource[]
  empty: string
}) {
  if (!items.length) {
    return <p className="profile-empty">{empty}</p>
  }
  return (
    <section className="profile-published" aria-label="Publicações">
      <h2>No perfil</h2>
      <div className="profile-pub-grid">
        {items.map((item) => (
          <Link key={item.id} to={`/share/${item.shareToken}`} className="profile-pub-card">
            <span className="profile-pub-kind">
              {item.resourceType === 'binder' ? 'Fichário' : 'Deck'}
            </span>
            <strong>{item.title || 'Sem título'}</strong>
            <span className="muted">Abrir leitura</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function ProfileEditModal({
  profile,
  onClose,
  onSaved,
  requireAuth,
}: {
  profile: Profile
  onClose: () => void
  onSaved: (p: Profile) => void
  requireAuth: () => boolean
}) {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState(profile.displayName ?? '')
  const [username, setUsername] = useState(profile.username ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [isPublic, setIsPublic] = useState(profile.isPublic)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!requireAuth() || !user) return
    setBusy(true)
    setError(null)
    try {
      const updated = await updateMyProfile(user.id, {
        displayName,
        username,
        bio,
        isPublic,
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="profile-modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Editar perfil"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
      >
        <h2>Editar perfil</h2>
        <label>
          Nome
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            pattern="[a-zA-Z0-9_]{3,24}"
            title="3–24 caracteres: letras, números ou _"
            required
          />
        </label>
        <label>
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={280} />
        </label>
        <label className="profile-check">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          Perfil público (visível pelo link e código)
        </label>
        {error && <p className="profile-error">{error}</p>}
        <div className="profile-modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}