import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCloudSync } from '../hooks/useCloudSync'
import './Layout.css'

export function Layout() {
  const { user, isAuthenticated, openAuth, signOut, isConfigured } = useAuth()
  const { syncing, lastSyncError, cloudReady, retrySync } = useCloudSync()

  const syncLabel = syncing
    ? 'Sincronizando…'
    : lastSyncError
      ? 'Erro na nuvem'
      : cloudReady
        ? 'Sincronizado'
        : 'Conta'

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
          <NavLink to="/calculadora">Calculadora</NavLink>
          {isAuthenticated && (
            <>
              <NavLink to="/amigos">Amigos</NavLink>
              <NavLink to="/perfil">Perfil</NavLink>
            </>
          )}
        </nav>

        <div className="topbar-end">
          {isConfigured && (
            <div className="auth-controls">
              {isAuthenticated ? (
                <>
                  <span
                    className={`auth-status${lastSyncError ? ' is-error' : ''}${syncing ? ' is-syncing' : ''}`}
                    title={lastSyncError ?? user?.email ?? undefined}
                  >
                    {syncLabel}
                  </span>
                  {lastSyncError && (
                    <button
                      type="button"
                      className="btn ghost auth-btn"
                      onClick={() => retrySync()}
                      title={lastSyncError}
                    >
                      Tentar de novo
                    </button>
                  )}
                  <button type="button" className="btn ghost auth-btn" onClick={() => void signOut()}>
                    Sair
                  </button>
                </>
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
    </div>
  )
}
