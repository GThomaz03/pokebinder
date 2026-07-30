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
}

export function BinderSettings({ binder, open, onClose, adapters }: Props) {
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
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const speciesPct = prog.total ? Math.round((prog.owned / prog.total) * 100) : 0
  const cardsPct = prog.slots ? Math.round((prog.filled / prog.slots) * 100) : 0
  const pageCount = binder.pages.length
  const isSpeciesBinder = binder.kind === 'pokedex' || binder.kind === 'wishlist'

  function commitRename() {
    const next = name.trim()
    if (next && next !== binder.name) renameBinder(next)
  }

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

        <section>
          <h3>Nome</h3>
          <label className="field">
            Nome do fichário
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
            />
          </label>
        </section>

        <section>
          <h3>Tamanho da grade</h3>
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
        </section>

        <section>
          <h3>Progresso da coleção</h3>
          {isSpeciesBinder ? (
            <>
              <div className="meter">
                <span>
                  {prog.owned} / {prog.total} espécies
                </span>
                <div className="bar">
                  <i style={{ width: `${speciesPct}%` }} />
                </div>
                <em>{speciesPct}%</em>
              </div>
              {binder.kind === 'pokedex' && !adapters && (
                <label className="toggle">
                  <span>Marcar tudo como faltando</span>
                  <button
                    type="button"
                    className="btn-soft"
                    onClick={() => setAllMissing()}
                  >
                    Resetar
                  </button>
                </label>
              )}
            </>
          ) : (
            <div className="meter">
              <span>
                {prog.filled} / {prog.slots}
              </span>
              <div className="bar">
                <i style={{ width: `${cardsPct}%` }} />
              </div>
              <em>{cardsPct}%</em>
            </div>
          )}
        </section>

        <section>
          <h3>Verso das cartas</h3>
          <Toggle
            label="Slots vazios como verso"
            checked={binder.settings.emptyAsCardBack}
            onChange={(v) => updateSettings({ emptyAsCardBack: v })}
          />
          <Toggle
            label="Faltantes como verso"
            checked={binder.settings.missingAsCardBack}
            onChange={(v) => updateSettings({ missingAsCardBack: v })}
          />
        </section>

        <section>
          <h3>Preços (em R$)</h3>
          <Toggle
            label="Mostrar preço em reais"
            checked={binder.settings.showPrices}
            onChange={(v) => updateSettings({ showPrices: v })}
          />
          <label className="field">
            Fonte convertida para BRL
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

        <section>
          <h3>Visibilidade</h3>
          <Toggle
            label="Escurecer cartas faltantes"
            checked={binder.settings.dimMissing}
            onChange={(v) => updateSettings({ dimMissing: v })}
          />
        </section>

        <section>
          <h3>Páginas</h3>
          <p className="muted">
            {pageCount} páginas
            {!isSpeciesBinder && ` · ${prog.filled}/${prog.slots} slots`}
          </p>
          {binder.kind === 'custom' && (
            <div className="page-stepper">
              <button type="button" className="btn-soft" onClick={() => addPages(2)}>
                + 2 páginas
              </button>
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </label>
  )
}
