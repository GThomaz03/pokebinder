import { useEffect, useState } from 'react'
import type { Binder, BinderSettings as BinderSettingsType, GridLayout } from '../../types'
import { GRID_OPTIONS } from '../../types'
import { useBinders } from '../../hooks/useBinders'
import './BinderSettings.css'

type SettingsAdapters = {
  updateSettings: (patch: Partial<BinderSettingsType>) => void
  setGrid: (grid: GridLayout) => void
  addPages: (count?: number) => void
  renameBinder: (name: string) => void
  progress?: () => { owned: number; total: number; filled: number; slots: number }
}

type Props = {
  binder: Binder
  open: boolean
  onClose: () => void
  /** Collab / external source — bypass useBinders mutations */
  adapters?: SettingsAdapters
  /** Render only sections (parent provides drawer chrome) */
  embedded?: boolean
}

export function BinderSettings({ binder, open, onClose, adapters, embedded }: Props) {
  const api = useBinders()
  const updateSettings = adapters?.updateSettings
    ?? ((patch: Partial<BinderSettingsType>) => api.updateSettings(binder.id, patch))
  const setGrid = adapters?.setGrid
    ?? ((grid: GridLayout) => api.setGrid(binder.id, grid))
  const addPages = adapters?.addPages
    ?? ((count?: number) => api.addPages(binder.id, count))
  const renameBinder = adapters?.renameBinder
    ?? ((name: string) => api.renameBinder(binder.id, name))
  const setAllMissing = () => api.setAllMissing(binder.id)
  const prog = adapters?.progress?.() ?? api.progress(binder.id)
  const [name, setName] = useState(binder.name)

  useEffect(() => {
    if (open) setName(binder.name)
  }, [open, binder.name])

  useEffect(() => {
    if (!open || embedded) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, embedded])

  if (!open) return null

  const speciesPct = prog.total ? Math.round((prog.owned / prog.total) * 100) : 0
  const cardsPct = prog.slots ? Math.round((prog.filled / prog.slots) * 100) : 0
  const pageCount = binder.pages.length
  const isSpeciesBinder = binder.kind === 'pokedex' || binder.kind === 'wishlist'

  function commitRename() {
    const next = name.trim()
    if (next && next !== binder.name) renameBinder(next)
  }

  const body = (
    <div className="settings-body">
      <section className="settings-block settings-block--progress">
        <div className="settings-block-head">
          <h3>Progresso</h3>
          <em className="settings-pct">{isSpeciesBinder ? `${speciesPct}%` : `${cardsPct}%`}</em>
        </div>
        {isSpeciesBinder ? (
          <>
            <div className="meter">
              <span>
                {prog.owned} / {prog.total} espécies
              </span>
              <div className="bar">
                <i style={{ width: `${speciesPct}%` }} />
              </div>
            </div>
            {binder.kind === 'pokedex' && !adapters && (
              <div className="settings-inline-action">
                <span>Marcar tudo como faltando</span>
                <button type="button" className="btn-soft" onClick={() => setAllMissing()}>
                  Resetar
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="meter">
            <span>
              {prog.filled} / {prog.slots} slots
            </span>
            <div className="bar">
              <i style={{ width: `${cardsPct}%` }} />
            </div>
          </div>
        )}
      </section>

      <section className="settings-block">
        <h3>Nome</h3>
        <label className="field">
          <span className="field-label">Nome do fichário</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </label>
      </section>

      <section className="settings-block">
        <h3>Estrutura</h3>
        <div className="settings-sub">
          <span className="settings-sub-label">Tamanho da grade</span>
          <div className="grid-choices">
            {GRID_OPTIONS.map((g) => (
              <button
                key={g}
                type="button"
                className={binder.grid === g ? 'active' : ''}
                onClick={() => setGrid(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-sub settings-sub--row">
          <div>
            <span className="settings-sub-label">Páginas</span>
            <p className="muted">
              {pageCount} {pageCount === 1 ? 'página' : 'páginas'}
              {!isSpeciesBinder && ` · ${prog.filled}/${prog.slots} preenchidos`}
            </p>
          </div>
          {binder.kind === 'custom' && (
            <button type="button" className="btn-soft" onClick={() => addPages(2)}>
              + 2 páginas
            </button>
          )}
        </div>
      </section>

      <section className="settings-block">
        <h3>Aparência</h3>
        <div className="toggle-list">
          <Toggle
            label="Slots vazios como verso"
            hint="Mostra o verso da carta nos espaços vazios"
            checked={binder.settings.emptyAsCardBack}
            onChange={(v) => updateSettings({ emptyAsCardBack: v })}
          />
          <Toggle
            label="Faltantes como verso"
            hint="Espécies faltantes usam o verso em vez de esmaecer"
            checked={binder.settings.missingAsCardBack}
            onChange={(v) => updateSettings({ missingAsCardBack: v })}
          />
          {binder.kind === 'repository' ? (
            <Toggle
              label="Mostrar cartas repetidas"
              hint="Inclui cópias extras no repositório"
              checked={Boolean(binder.settings.showDuplicates)}
              onChange={(v) => updateSettings({ showDuplicates: v })}
            />
          ) : (
            <Toggle
              label="Ignorar efeito de faltante"
              hint="Cartas faltantes ficam com opacidade normal"
              checked={!binder.settings.dimMissing}
              onChange={(v) => updateSettings({ dimMissing: !v })}
            />
          )}
        </div>
      </section>

      <section className="settings-block">
        <h3>Preços</h3>
        <div className="toggle-list">
          <Toggle
            label="Mostrar preço em reais"
            hint="Exibe o valor convertido sob as cartas"
            checked={binder.settings.showPrices}
            onChange={(v) => updateSettings({ showPrices: v })}
          />
        </div>
        <label className="field">
          <span className="field-label">Fonte convertida para BRL</span>
          <select
            value={binder.settings.priceMarket}
            onChange={(e) =>
              updateSettings({
                priceMarket: e.target.value as 'cardmarket' | 'tcgplayer',
              })
            }
          >
            <option value="cardmarket">Cardmarket → R$</option>
            <option value="tcgplayer">TCGPlayer → R$</option>
          </select>
        </label>
      </section>
    </div>
  )

  if (embedded) return <div className="settings-embedded">{body}</div>

  return (
    <div className="settings-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Configurações do fichário"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <h2>Configurações</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        {body}
      </aside>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="toggle">
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </label>
  )
}
