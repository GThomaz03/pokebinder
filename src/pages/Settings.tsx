import { LANG_OPTIONS } from '../i18n'
import { useCloudSync } from '../hooks/useCloudSync'
import { useLanguage } from '../hooks/useLanguage'
import type { CardLang } from '../types'
import './Settings.css'

export function SettingsPage() {
  const { lang, setLang } = useLanguage()
  const { syncing, lastSyncError, cloudReady, retrySync } = useCloudSync()

  const syncLabel = syncing
    ? 'Sincronizando…'
    : lastSyncError
      ? 'Erro na nuvem'
      : cloudReady
        ? 'Sincronizado com a nuvem'
        : 'Nuvem indisponível'

  return (
    <div className="settings-page">
      <header className="settings-page-hero">
        <p className="settings-page-eyebrow">Conta</p>
        <h1>Configurações</h1>
        <p className="muted">Idioma das cartas e status da sincronização.</p>
      </header>

      <section className="settings-page-card" aria-labelledby="settings-lang">
        <h2 id="settings-lang">Idioma das cartas</h2>
        <p className="muted">Usado na busca, nomes e imagens do TCGdex.</p>
        <div className="settings-lang-row" role="group" aria-label="Idioma das cartas">
          {LANG_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`btn ${lang === opt.value ? 'primary' : 'ghost'}`}
              onClick={() => setLang(opt.value as CardLang)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-page-card" aria-labelledby="settings-sync">
        <h2 id="settings-sync">Sincronização</h2>
        <p
          className={`settings-sync-status${lastSyncError ? ' is-error' : ''}${syncing ? ' is-syncing' : ''}`}
        >
          {syncLabel}
        </p>
        {lastSyncError && (
          <>
            <p className="settings-sync-error">{lastSyncError}</p>
            <button type="button" className="btn ghost" onClick={() => retrySync()}>
              Tentar sincronizar de novo
            </button>
          </>
        )}
      </section>
    </div>
  )
}
