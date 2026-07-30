import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import './AuthModal.css'

type Tab = 'magic' | 'password'

export function AuthModal() {
  const {
    authOpen,
    authMode,
    closeAuth,
    openAuth,
    signInWithPassword,
    signUpWithPassword,
    signInWithMagicLink,
    isConfigured,
  } = useAuth()

  const [tab, setTab] = useState<Tab>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!authOpen) {
      setEmail('')
      setPassword('')
      setMessage(null)
      setError(null)
      setBusy(false)
    }
  }, [authOpen])

  if (!authOpen) return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setBusy(true)

    try {
      if (tab === 'magic') {
        const { error: err } = await signInWithMagicLink(email.trim())
        if (err) setError(err)
        else setMessage('Enviamos um link de acesso para o seu e-mail. Verifique a caixa de entrada.')
      } else if (authMode === 'signup') {
        const { error: err } = await signUpWithPassword(email.trim(), password)
        if (err) setError(err)
        else setMessage('Conta criada! Confirme o e-mail se solicitado, ou entre com a senha.')
      } else {
        const { error: err } = await signInWithPassword(email.trim(), password)
        if (err) setError(err)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-backdrop" role="presentation" onClick={closeAuth}>
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="auth-close" onClick={closeAuth} aria-label="Fechar">
          ×
        </button>

        <header className="auth-header">
          <p className="auth-eyebrow">Conta PokéBinder</p>
          <h2 id="auth-title">
            {authMode === 'signup' ? 'Criar conta' : 'Entrar na sua conta'}
          </h2>
          <p className="auth-sub">
            Login opcional para usar o app. Obrigatório para salvar na nuvem e compartilhar
            fichários, decks e repositório entre dispositivos.
          </p>
        </header>

        {!isConfigured && (
          <p className="auth-alert">
            Supabase ainda não configurado. Defina <code>VITE_SUPABASE_URL</code> e{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> no ambiente.
          </p>
        )}

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'magic'}
            className={tab === 'magic' ? 'active' : ''}
            onClick={() => setTab('magic')}
          >
            Link por e-mail
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'password'}
            className={tab === 'password' ? 'active' : ''}
            onClick={() => setTab('password')}
          >
            E-mail e senha
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="voce@email.com"
              disabled={!isConfigured || busy}
            />
          </label>

          {tab === 'password' && (
            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="Mínimo 6 caracteres"
                disabled={!isConfigured || busy}
              />
            </label>
          )}

          {error && <p className="auth-error">{error}</p>}
          {message && <p className="auth-success">{message}</p>}

          <button type="submit" className="btn primary auth-submit" disabled={!isConfigured || busy}>
            {busy
              ? 'Aguarde…'
              : tab === 'magic'
                ? 'Enviar link de acesso'
                : authMode === 'signup'
                  ? 'Criar conta'
                  : 'Entrar'}
          </button>
        </form>

        <p className="auth-switch">
          {authMode === 'signup' ? (
            <>
              Já tem conta?{' '}
              <button type="button" onClick={() => openAuth('signin')}>
                Entrar
              </button>
            </>
          ) : (
            <>
              Primeira vez?{' '}
              <button type="button" onClick={() => openAuth('signup')}>
                Criar conta
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
