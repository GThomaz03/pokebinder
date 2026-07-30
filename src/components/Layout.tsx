import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCloudSync } from '../hooks/useCloudSync'
import './Layout.css'

export function Layout() {
  const { user, isAuthenticated, openAuth, signOut, isConfigured } = useAuth()
  const { syncing, lastSyncError, cloudReady } = useCloudSync()

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
        </nav>

        <div className="topbar-end">
          {isConfigured && (
            <div className="auth-controls">
              {isAuthenticated ? (
                <>
                  <span className="auth-status" title={user?.email ?? undefined}>
                    {syncing ? 'Sincronizando…' : cloudReady ? 'Nuvem' : 'Conta'}
                    {lastSyncError ? ' · erro' : ''}
                  </span>
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
          Você pode usar o app localmente. Entre na conta para salvar fichários, decks e repositório
          na nuvem e para compartilhar com outras pessoas.
        </div>
      )}

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
