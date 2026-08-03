import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getMyProfile, initials, type Profile } from '../lib/social'
import { useAuth } from '../hooks/useAuth'
import { useCloudSync } from '../hooks/useCloudSync'
import { AccountDrawer } from './AccountDrawer'
import './Layout.css'

export function Layout() {
  const { user, isAuthenticated, openAuth, signOut, isConfigured } = useAuth()
  const { syncing, lastSyncError, cloudReady, retrySync } = useCloudSync()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      return
    }
    try {
      setProfile(await getMyProfile(user.id))
    } catch {
      setProfile(null)
    }
  }, [user])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile, location.pathname])

  useEffect(() => {
    if (!menuOpen || !user) return
    void loadProfile()
  }, [menuOpen, user, loadProfile])

  const syncLabel = syncing
    ? 'Sincronizando…'
    : lastSyncError
      ? 'Erro na nuvem'
      : cloudReady
        ? 'Sincronizado'
        : 'Conta'

  const avatarUrl = profile?.avatarUrl
  const avatarLabel = profile
    ? initials(profile)
    : (user?.email?.slice(0, 2) ?? '?').toUpperCase()

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden />
          <span>PokéBinder</span>
        </NavLink>

        <nav className="nav" aria-label="Principal">
          <NavLink to="/" end>
            Fichários
          </NavLink>
          <NavLink to="/decks">Decks</NavLink>
          <NavLink to="/repository">Repositório</NavLink>
          <NavLink to="/pesquisa">Pesquisa</NavLink>
          <NavLink to="/calculadora">Calculadora</NavLink>
          {isAuthenticated && <NavLink to="/amigos">Amigos</NavLink>}
        </nav>

        <div className="topbar-end">
          {isConfigured && (
            <div className="auth-controls">
              {isAuthenticated ? (
                <button
                  type="button"
                  className={`topbar-avatar${avatarUrl ? ' has-photo' : ''}`}
                  onClick={() => setMenuOpen(true)}
                  aria-label="Abrir menu da conta"
                  title={profile?.displayName || user?.email || 'Conta'}
                >
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : avatarLabel}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary auth-btn"
                  onClick={() => openAuth('signin')}
                >
                  Entrar
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {!isAuthenticated && isConfigured && (
        <div className="cloud-hint" role="note">
          Entre na conta para sincronizar automaticamente com a nuvem, publicar fichários e seguir
          amigos.
        </div>
      )}

      <main className="main">
        <Outlet />
      </main>

      <AccountDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        profile={profile}
        email={user?.email}
        syncLabel={syncLabel}
        syncing={syncing}
        syncError={lastSyncError}
        onRetrySync={retrySync}
        onSignOut={() => void signOut()}
      />
    </div>
  )
}
