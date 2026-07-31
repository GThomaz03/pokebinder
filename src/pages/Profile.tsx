import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AddCardsModal } from '../components/binder/AddCardsModal'
import { CardImage } from '../components/CardImage'
import { hydrateCard } from '../api/prices'
import {
  clearAvatar,
  followUser,
  getMyProfile,
  getProfileByUsername,
  initials,
  isFollowing,
  listPublishedByUser,
  profileUrl,
  unfollowUser,
  updateMyProfile,
  uploadAvatar,
  type Profile,
  type PublishedResource,
} from '../lib/social'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../hooks/useLanguage'
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

function ProfileAvatar({ profile }: { profile: Profile }) {
  if (profile.avatarUrl) {
    return (
      <div className="profile-avatar profile-avatar--photo">
        <img src={profile.avatarUrl} alt="" />
      </div>
    )
  }
  return (
    <div className="profile-avatar" aria-hidden>
      {initials(profile)}
    </div>
  )
}

function FavoriteCardPanel({ profile }: { profile: Profile }) {
  const hasCard = Boolean(profile.favoriteCardId)
  return (
    <div className="profile-fav" aria-label="Carta favorita">
      <span className="profile-fav-label">Carta favorita</span>
      <div className={`profile-fav-frame${hasCard ? '' : ' profile-fav-frame--empty'}`}>
        {hasCard ? (
          <CardImage
            src={profile.favoriteCardImage}
            alt={profile.favoriteCardName ?? 'Carta favorita'}
            quality="high"
            cardId={profile.favoriteCardId ?? undefined}
            cardName={profile.favoriteCardName ?? undefined}
          />
        ) : (
          <span className="profile-fav-unknown" aria-hidden>
            ?
          </span>
        )}
      </div>
      {hasCard && profile.favoriteCardName && (
        <span className="profile-fav-name">{profile.favoriteCardName}</span>
      )}
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
      <ProfileAvatar profile={profile} />
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
      <FavoriteCardPanel profile={profile} />
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
  const { lang } = useLanguage()
  const fileRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(profile.displayName ?? '')
  const [username, setUsername] = useState(profile.username ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [isPublic, setIsPublic] = useState(profile.isPublic)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatarUrl)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [favId, setFavId] = useState<string | null>(profile.favoriteCardId)
  const [favName, setFavName] = useState<string | null>(profile.favoriteCardName)
  const [favImage, setFavImage] = useState<string | null>(profile.favoriteCardImage)
  const [pickCard, setPickCard] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onAvatarChange(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Envie uma imagem (JPEG, PNG, WebP ou GIF).')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('A foto deve ter no máximo 2 MB.')
      return
    }
    setError(null)
    setRemoveAvatar(false)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function onPickFavorite(cardIds: string[]) {
    const id = cardIds[0]
    if (!id) return
    setPickCard(false)
    try {
      const card = await hydrateCard(lang, id)
      setFavId(id)
      setFavName(card?.name ?? id)
      setFavImage(card?.image ?? null)
    } catch {
      setFavId(id)
      setFavName(id)
      setFavImage(null)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!requireAuth() || !user) return
    setBusy(true)
    setError(null)
    try {
      let nextAvatar = profile.avatarUrl
      if (removeAvatar) {
        await clearAvatar(user.id)
        nextAvatar = null
      } else if (avatarFile) {
        nextAvatar = await uploadAvatar(user.id, avatarFile)
      }

      const updated = await updateMyProfile(user.id, {
        displayName,
        username,
        bio,
        isPublic,
        avatarUrl: nextAvatar,
        favoriteCardId: favId,
        favoriteCardName: favName,
        favoriteCardImage: favImage,
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {!pickCard && (
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

          <div className="profile-edit-avatar">
            <div className={`profile-avatar${avatarPreview ? ' profile-avatar--photo' : ''}`}>
              {avatarPreview ? <img src={avatarPreview} alt="" /> : initials(profile)}
            </div>
            <div className="profile-edit-avatar-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={(e) => onAvatarChange(e.target.files?.[0] ?? null)}
              />
              <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
                Escolher foto
              </button>
              {(avatarPreview || profile.avatarUrl) && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setAvatarFile(null)
                    setAvatarPreview(null)
                    setRemoveAvatar(true)
                  }}
                >
                  Remover foto
                </button>
              )}
              <span className="muted profile-hint">JPEG, PNG, WebP ou GIF · máx. 2 MB</span>
            </div>
          </div>

          <div className="profile-edit-fav">
            <span className="profile-edit-fav-title">Carta favorita</span>
            <div className="profile-edit-fav-row">
              <div className={`profile-fav-frame${favId ? '' : ' profile-fav-frame--empty'}`}>
                {favId ? (
                  <CardImage
                    src={favImage}
                    alt={favName ?? ''}
                    quality="low"
                    cardId={favId}
                    cardName={favName ?? undefined}
                  />
                ) : (
                  <span className="profile-fav-unknown" aria-hidden>
                    ?
                  </span>
                )}
              </div>
              <div className="profile-edit-fav-actions">
                <button type="button" className="btn ghost" onClick={() => setPickCard(true)}>
                  {favId ? 'Trocar carta' : 'Escolher carta'}
                </button>
                {favId && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setFavId(null)
                      setFavName(null)
                      setFavImage(null)
                    }}
                  >
                    Remover
                  </button>
                )}
                {favName && <span className="muted">{favName}</span>}
              </div>
            </div>
          </div>

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
      )}

      <AddCardsModal
        open={pickCard}
        onClose={() => setPickCard(false)}
        onAdd={(ids) => void onPickFavorite(ids)}
        replaceMode
      />
    </>
  )
}
