import { useEffect, useMemo, useState } from 'react'
import { listPlaceholderDexIds } from '../../lib/placeholderSheets'
import type { Binder } from '../../types'
import {
  type PlaceholderContent,
  type PlaceholderImageStyle,
} from './PlaceholderCard'
import { PlaceholderPreview } from './PlaceholderPreview'
import './PlaceholderPrint.css'

type Props = {
  open: boolean
  binder: Binder
  onClose: () => void
}

type Step = 'options' | 'preview'

export function PlaceholderWizard({ open, binder, onClose }: Props) {
  const [step, setStep] = useState<Step>('options')
  const [content, setContent] = useState<PlaceholderContent>('text')
  const [imageStyle, setImageStyle] = useState<PlaceholderImageStyle>('art')
  const [includeOwned, setIncludeOwned] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep('options')
    setContent('text')
    setImageStyle('art')
    setIncludeOwned(false)
  }, [open])

  useEffect(() => {
    if (!open || step !== 'options') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, step, onClose])

  const dexIds = useMemo(
    () => listPlaceholderDexIds(binder, { includeOwned }),
    [binder, includeOwned],
  )

  const missingCount = useMemo(
    () => listPlaceholderDexIds(binder, { includeOwned: false }).length,
    [binder],
  )
  const totalCount = useMemo(
    () => listPlaceholderDexIds(binder, { includeOwned: true }).length,
    [binder],
  )

  if (!open) return null

  if (step === 'preview') {
    return (
      <PlaceholderPreview
        open
        initialDexIds={dexIds}
        content={content}
        imageStyle={imageStyle}
        onClose={onClose}
        onBack={() => setStep('options')}
      />
    )
  }

  return (
    <div className="ph-wizard-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ph-wizard-modal"
        role="dialog"
        aria-modal
        aria-label="Gerar placeholders"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ph-wizard-head">
          <div>
            <h2>Placeholders para imprimir</h2>
            <p>
              Gere folhas A4 com 9 cartas no tamanho TCG (63×88&nbsp;mm) e bordas pontilhadas
              para corte.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="ph-wizard-body">
          <fieldset className="ph-wizard-field">
            <legend>Conteúdo</legend>
            <label className="ph-wizard-choice">
              <input
                type="radio"
                name="ph-content"
                checked={content === 'text'}
                onChange={() => setContent('text')}
              />
              <span>
                <strong>Só nome e número</strong>
                <small>Texto centralizado, sem imagem</small>
              </span>
            </label>
            <label className="ph-wizard-choice">
              <input
                type="radio"
                name="ph-content"
                checked={content === 'image'}
                onChange={() => setContent('image')}
              />
              <span>
                <strong>Com imagem</strong>
                <small>Sprite ou arte oficial + nome e número</small>
              </span>
            </label>
          </fieldset>

          {content === 'image' && (
            <fieldset className="ph-wizard-field">
              <legend>Estilo da imagem</legend>
              <label className="ph-wizard-choice">
                <input
                  type="radio"
                  name="ph-image"
                  checked={imageStyle === 'pixel'}
                  onChange={() => setImageStyle('pixel')}
                />
                <span>
                  <strong>Pixels</strong>
                  <small>Sprite clássico (estilo Game Boy)</small>
                </span>
              </label>
              <label className="ph-wizard-choice">
                <input
                  type="radio"
                  name="ph-image"
                  checked={imageStyle === 'art'}
                  onChange={() => setImageStyle('art')}
                />
                <span>
                  <strong>Arte oficial</strong>
                  <small>Mesma arte do reorganizar Pokédex</small>
                </span>
              </label>
            </fieldset>
          )}

          <fieldset className="ph-wizard-field">
            <legend>Quais espécies</legend>
            <label className="ph-wizard-check">
              <input
                type="checkbox"
                checked={includeOwned}
                onChange={(e) => setIncludeOwned(e.target.checked)}
              />
              <span>
                Incluir os que já tenho
                <small>
                  {includeOwned
                    ? `${totalCount} no fichário`
                    : `${missingCount} faltando · ${totalCount} no total`}
                </small>
              </span>
            </label>
          </fieldset>
        </div>

        <footer className="ph-wizard-foot">
          <span className="ph-wizard-count">
            {dexIds.length} placeholder{dexIds.length === 1 ? '' : 's'}
          </span>
          <div className="ph-wizard-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={dexIds.length === 0}
              onClick={() => setStep('preview')}
            >
              Continuar
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
