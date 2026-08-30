import { useEffect, useState } from 'react'
import { getCachedCard } from '../api/prices'
import { getSetsMeta } from '../api/sets'
import { baseCardId } from '../api/cardKeys'
import { useLanguage } from '../hooks/useLanguage'
import type { Binder } from '../types'
import {
  collectExportEntries,
  downloadTextFile,
  prepareLigaExportData,
  rowsFromInventory,
  slugifyFilename,
  toLigaCollectionCsv,
  toLigaListTxt,
  type LigaExportRow,
  type LigaExportStats,
  type LigaSetInfo,
} from '../lib/ligaPokemonExport'
import './ShareModal.css'
import './ExportLigaModal.css'

type Props = {
  open: boolean
  onClose: () => void
  inventoryEntries?: Array<{ key: string; qty: number }>
  binder?: Binder | null
  title: string
}

export function ExportLigaModal({
  open,
  onClose,
  inventoryEntries,
  binder,
  title,
}: Props) {
  const { lang } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<LigaExportRow[]>([])
  const [stats, setStats] = useState<LigaExportStats>({
    total: 0,
    exportable: 0,
    missingName: 0,
    guessed: 0,
  })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      setRows([])
      setStats({ total: 0, exportable: 0, missingName: 0, guessed: 0 })
      return
    }

    const entries = collectExportEntries(binder, inventoryEntries)
    if (!entries.length) {
      setRows([])
      setStats({ total: 0, exportable: 0, missingName: 0, guessed: 0 })
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    void (async () => {
      const { namesById } = await prepareLigaExportData(lang, entries)
      if (cancelled) return

      const setIds = [
        ...new Set(
          entries.flatMap((e) => {
            const card = getCachedCard(e.key)
            const base = baseCardId(e.key)
            const dash = base.lastIndexOf('-')
            const fromId = dash > 0 ? base.slice(0, dash) : ''
            return [card?.setId, fromId].filter((id): id is string => Boolean(id))
          }),
        ),
      ]

      const nextSetInfo: Record<string, LigaSetInfo | undefined> = {}
      if (setIds.length) {
        const map = await getSetsMeta(lang, setIds)
        if (cancelled) return
        for (const id of setIds) {
          const meta = map[id]
          nextSetInfo[id] = {
            abbreviation: undefined,
            nameEn: meta?.name,
            namePt: meta?.name,
            cardCount: meta?.cardCountOfficial ?? meta?.cardCount,
          }
        }
      }

      const nextRows = rowsFromInventory(entries, getCachedCard, nextSetInfo, namesById)
      const exportable = nextRows.filter((r) => !r.missingCardName && r.nameEn.trim())
      const nextStats: LigaExportStats = {
        total: nextRows.length,
        exportable: exportable.length,
        missingName: nextRows.filter((r) => r.missingCardName).length,
        guessed: nextRows.filter((r) => r.setCodeGuess).length,
      }

      if (cancelled) return
      setRows(nextRows)
      setStats(nextStats)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [open, lang, binder, inventoryEntries])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const csv = toLigaCollectionCsv(rows)
  const txt = toLigaListTxt(rows)
  const baseName = slugifyFilename(title)
  const exportableQty = rows
    .filter((r) => !r.missingCardName && r.nameEn.trim())
    .reduce((s, r) => s + r.qty, 0)

  function downloadCsv() {
    downloadTextFile(`liga-${baseName}.csv`, csv)
  }

  function downloadTxt() {
    downloadTextFile(`liga-${baseName}.txt`, txt, 'text/plain;charset=utf-8')
  }

  async function copyTxt() {
    try {
      await navigator.clipboard.writeText(txt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="share-backdrop" role="presentation" onClick={onClose}>
      <div
        className="share-modal export-liga-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-liga-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="share-close" aria-label="Fechar" onClick={onClose}>
          ×
        </button>
        <h2 id="export-liga-title">Exportar para Liga Pokémon</h2>
        <p className="share-sub">
          <strong>CSV</strong> — formato oficial (14 colunas) para{' '}
          <strong>Coleção → Importar</strong>.{' '}
          <strong>TXT / Copiar lista</strong> — para o Bazar ({' '}
          <em>Cadastrar por Lista</em>): use{' '}
          <code>1 Nome [SIGLA] 29</code> (não coloque o número entre parênteses antes
          da sigla).
        </p>

        <p className="export-liga-stats">
          {loading ? (
            <>Carregando catálogo…</>
          ) : (
            <>
              <strong>{stats.exportable}</strong> linhas ·{' '}
              <strong>{exportableQty}</strong> cartas
              {stats.guessed > 0 ? ` · ${stats.guessed} sem sigla mapeada` : ''}
              {stats.missingName > 0
                ? ` · ${stats.missingName} omitidas (fora do catálogo)`
                : ''}
            </>
          )}
        </p>

        {!loading && rows.length === 0 ? (
          <p className="share-error">Nenhuma carta para exportar.</p>
        ) : !loading && stats.exportable === 0 ? (
          <p className="share-error">
            Nenhuma carta encontrada no catálogo. Verifique se o inventário tem ids
            válidos ou se o catálogo foi importado.
          </p>
        ) : (
          <>
            <div className="export-liga-preview" tabIndex={0}>
              <pre>
                {loading ? '…' : `${txt.slice(0, 1200)}${txt.length > 1200 ? '\n…' : ''}`}
              </pre>
            </div>
            <div className="export-liga-actions">
              <button
                type="button"
                className="primary"
                onClick={downloadCsv}
                disabled={loading || stats.exportable === 0}
              >
                Baixar CSV
              </button>
              <button
                type="button"
                onClick={downloadTxt}
                disabled={loading || stats.exportable === 0}
              >
                Baixar TXT
              </button>
              <button
                type="button"
                onClick={() => void copyTxt()}
                disabled={loading || stats.exportable === 0}
              >
                {copied ? 'Copiado!' : 'Copiar lista'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
