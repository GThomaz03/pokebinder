import { useEffect, useMemo, useState } from 'react'
import {
  PLACEHOLDER_PER_PAGE,
  packPlaceholderPages,
} from '../../lib/placeholderSheets'
import {
  PlaceholderCard,
  type PlaceholderContent,
  type PlaceholderImageStyle,
} from './PlaceholderCard'
import './PlaceholderPrint.css'

type Props = {
  open: boolean
  initialDexIds: number[]
  content: PlaceholderContent
  imageStyle: PlaceholderImageStyle
  onClose: () => void
  onBack: () => void
}

export function PlaceholderPreview({
  open,
  initialDexIds,
  content,
  imageStyle,
  onClose,
  onBack,
}: Props) {
  const [dexIds, setDexIds] = useState<number[]>(initialDexIds)
  const [marked, setMarked] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!open) return
    setDexIds(initialDexIds)
    setMarked(new Set())
  }, [open, initialDexIds])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const pages = useMemo(
    () => packPlaceholderPages(dexIds, PLACEHOLDER_PER_PAGE),
    [dexIds],
  )

  const remaining = dexIds.length
  const markedCount = marked.size

  if (!open) return null

  function toggleMark(dexId: number) {
    setMarked((prev) => {
      const next = new Set(prev)
      if (next.has(dexId)) next.delete(dexId)
      else next.add(dexId)
      return next
    })
  }

  function optimize() {
    if (marked.size === 0) return
    setDexIds((prev) => prev.filter((id) => !marked.has(id)))
    setMarked(new Set())
  }

  function restore() {
    setDexIds(initialDexIds)
    setMarked(new Set())
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="ph-preview" role="dialog" aria-modal aria-label="Preview dos placeholders">
      <header className="ph-preview-bar no-print">
        <div className="ph-preview-bar-left">
          <button type="button" className="btn-ghost" onClick={onBack}>
            ← Opções
          </button>
          <span className="ph-preview-stats">
            {remaining} placeholder{remaining === 1 ? '' : 's'} · {pages.length} página
            {pages.length === 1 ? '' : 's'}
            {markedCount > 0 && (
              <>
                {' '}
                · <em>{markedCount} marcado{markedCount === 1 ? '' : 's'}</em>
              </>
            )}
          </span>
        </div>
        <div className="ph-preview-bar-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={markedCount === 0}
            onClick={optimize}
            title="Remove os marcados e reorganiza as páginas"
          >
            Otimizar páginas
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={
              dexIds.length === initialDexIds.length && markedCount === 0
            }
            onClick={restore}
          >
            Restaurar lista
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={remaining === 0}
            onClick={handlePrint}
          >
            Imprimir / salvar PDF
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
      </header>

      <p className="ph-preview-hint no-print">
        Clique nas cartas para marcar as que não quer imprimir. Depois use{' '}
        <strong>Otimizar páginas</strong> para fechar os buracos. Na impressão, use escala{' '}
        <strong>100%</strong> (sem ajustar à página).
      </p>

      <div className="ph-preview-scroll">
        {pages.length === 0 ? (
          <p className="ph-preview-empty no-print">Nenhum placeholder restante.</p>
        ) : (
          <div className="ph-print-root" id="ph-print-root">
            {pages.map((page, pageIndex) => (
              <div key={pageIndex} className="ph-sheet-wrap">
                <section
                  className="ph-sheet"
                  aria-label={`Página ${pageIndex + 1} de ${pages.length}`}
                >
                  <div className="ph-sheet-grid">
                    {page.map((dexId, slotIndex) => (
                      <PlaceholderCard
                        key={`${pageIndex}-${slotIndex}-${dexId ?? 'empty'}`}
                        dexId={dexId}
                        content={content}
                        imageStyle={imageStyle}
                        marked={dexId != null && marked.has(dexId)}
                        interactive={dexId != null}
                        onToggle={
                          dexId != null ? () => toggleMark(dexId) : undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
