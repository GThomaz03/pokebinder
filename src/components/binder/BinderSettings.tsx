import { useEffect, useState } from 'react'
import type { Binder } from '../../types'
import { GRID_OPTIONS } from '../../types'
import { useBinders } from '../../hooks/useBinders'
import './BinderSettings.css'

type Props = {
  binder: Binder
  open: boolean
  onClose: () => void
}

export function BinderSettings({ binder, open, onClose }: Props) {
  const {
    updateSettings,
    setGrid,
    addPages,
    setAllMissing,
    renameBinder,
    progress,
  } = useBinders()
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

  const prog = progress(binder.id)
  const speciesPct = prog.total ? Math.round((prog.owned / prog.total) * 100) : 0
  const cardsPct = prog.slots ? Math.round((prog.filled / prog.slots) * 100) : 0
  const pageCount = binder.pages.length
  const isSpeciesBinder = binder.kind === 'pokedex' || binder.kind === 'wishlist'

  function commitRename() {
    const next = name.trim()
    if (next && next !== binder.name) renameBinder(binder.id, next)
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
                onClick={() => setGrid(binder.id, g)}
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
              {binder.kind === 'pokedex' && (
                <label className="toggle">
                  <span>Marcar tudo como faltando</span>
                  <button
                    type="button"
                    className="btn-soft"
                    onClick={() => setAllMissing(binder.id)}
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
            onChange={(v) => updateSettings(binder.id, { emptyAsCardBack: v })}
          />
          <Toggle
            label="Faltantes como verso"
            checked={binder.settings.missingAsCardBack}
            onChange={(v) => updateSettings(binder.id, { missingAsCardBack: v })}
          />
        </section>

        <section>
          <h3>Preços (em R$)</h3>
          <Toggle
            label="Mostrar preço em reais"
            checked={binder.settings.showPrices}
            onChange={(v) => updateSettings(binder.id, { showPrices: v })}
          />
          <label className="field">
            Fonte convertida para BRL
            <select
              value={binder.settings.priceMarket}
              onChange={(e) =>
                updateSettings(binder.id, {
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
            onChange={(v) => updateSettings(binder.id, { dimMissing: v })}
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
              <button type="button" className="btn-soft" onClick={() => addPages(binder.id, 2)}>
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
