import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { initials, type Profile } from '../lib/social'
import './AccountDrawer.css'

type Props = {
  open: boolean
  onClose: () => void
  profile: Profile | null
  email?: string | null
  syncLabel: string
  syncing: boolean
  syncError: string | null
  onRetrySync: () => void
  onSignOut: () => void
}

function avatarInitials(profile: Profile | null, email?: string | null) {
  if (profile) return initials(profile)
  return (email?.slice(0, 2) ?? '?').toUpperCase()
}

export function AccountDrawer({
  open,
  onClose,
  profile,
  email,
  syncLabel,
  syncing,
  syncError,
  onRetrySync,
  onSignOut,
}: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const name = profile?.displayName || profile?.username || 'Treinador'
  const avatarUrl = profile?.avatarUrl

  return (
    <div className="account-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="account-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu da conta"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="account-drawer-head">
          <div className={`account-drawer-avatar${avatarUrl ? ' has-photo' : ''}`}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : avatarInitials(profile, email)}
          </div>
          <div className="account-drawer-meta">
            <strong>{name}</strong>
            {profile?.username && <span>@{profile.username}</span>}
            {email && <span className="account-drawer-email">{email}</span>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <p
          className={`account-sync${syncError ? ' is-error' : ''}${syncing ? ' is-syncing' : ''}`}
          title={syncError ?? undefined}
        >
          {syncLabel}
          {syncError && (
            <button type="button" className="account-sync-retry" onClick={onRetrySync}>
              Tentar de novo
            </button>
          )}
        </p>

        <nav className="account-drawer-nav" aria-label="Conta">
          <NavLink to="/perfil" onClick={onClose}>
            Perfil
          </NavLink>
          <NavLink to="/configuracoes" onClick={onClose}>
            Configurações
          </NavLink>
        </nav>

        <div className="account-drawer-foot">
          <button
            type="button"
            className="btn ghost account-signout"
            onClick={() => {
              onClose()
              onSignOut()
            }}
          >
            Sair
          </button>
        </div>
      </aside>
    </div>
  )
}
