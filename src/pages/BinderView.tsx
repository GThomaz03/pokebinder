import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AddCardsModal } from '../components/binder/AddCardsModal'
import { BinderSettings } from '../components/binder/BinderSettings'
import { BinderSpread } from '../components/binder/BinderSpread'
import { CardDetailsModal } from '../components/binder/CardDetailsModal'
import { PokedexPanel } from '../components/binder/PokedexPanel'
import { PokedexReorderModal } from '../components/binder/PokedexReorderModal'
import { ToolsSidebar } from '../components/binder/ToolsSidebar'
import { useBinders } from '../hooks/useBinders'
import { useInventory } from '../hooks/useInventory'
import { useLanguage } from '../hooks/useLanguage'
import { useTray } from '../hooks/useTray'
import { getCachedCard, hydrateCard } from '../api/prices'
import { useFxRates } from '../hooks/useCardQueries'
import { baseCardId, parseOwnedKey } from '../api/tcgdex'
import { CardImage } from '../components/CardImage'
import { binderTotalBrl, getPokedexName } from '../lib/binderUtils'
import {
  buildRepositoryPages,
  inventoryCardCount,
  inventoryTotalBrl,
} from '../lib/repositoryBinder'
import type { Binder, SlotRef, ToolMode } from '../types'
import { slotDisplayCardId } from '../types'
import '../themes/binder-themes.css'
import './BinderView.css'

export function BinderViewPage() {
  const { id = '' } = useParams()
  const {
    getBinder,
    swapSlot,
    setPageLabel,
    clearPage,
    addCardsToPage,
    updatePokedexSlot,
    addPages,
    clearSlot,
    takeSlot,
    setSlot,
    markSlotMissing,
    togglePin,
    reorderPages,
    updateSettings,
    setGrid,
    renameBinder,
    reorderPokedexSlots,
  } = useBinders()
  const { entries } = useInventory()
  const { lang } = useLanguage()
  const tray = useTray()

  const storedBinder = getBinder(id)
  useFxRates(Boolean(storedBinder?.settings.showPrices))
  const [spreadIndex, setSpreadIndex] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [replaceRef, setReplaceRef] = useState<SlotRef | null>(null)
  const [toolMode, setToolMode] = useState<ToolMode>('none')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [dexEdit, setDexEdit] = useState<SlotRef | null>(null)
  const [detailsKey, setDetailsKey] = useState<string | null>(null)
  const [inspectRef, setInspectRef] = useState<SlotRef | null>(null)
  const [priceTick, setPriceTick] = useState(0)
  const [reorderOpen, setReorderOpen] = useState(false)

  const isRepository = storedBinder?.kind === 'repository'

  const binder: Binder | undefined = useMemo(() => {
    if (!storedBinder) return undefined
    if (storedBinder.kind !== 'repository') return storedBinder
    return {
      ...storedBinder,
      pages: buildRepositoryPages(
        entries,
        storedBinder.grid,
        Boolean(storedBinder.settings.showDuplicates),
      ),
    }
  }, [storedBinder, entries, priceTick])

  const overlayOpen =
    settingsOpen ||
    addOpen ||
    Boolean(dexEdit) ||
    Boolean(detailsKey) ||
    reorderOpen

  const pages = binder?.pages ?? []
  const totalSpreads = Math.max(1, Math.ceil(pages.length / 2))
  const safeSpread = Math.min(spreadIndex, totalSpreads - 1)
  const leftIndex = Math.max(0, safeSpread * 2)
  const rightIndex = leftIndex + 1
  const leftPage = pages[leftIndex]
  const rightPage = pages[rightIndex] ?? null

  useEffect(() => {
    if (spreadIndex !== safeSpread) setSpreadIndex(safeSpread)
  }, [spreadIndex, safeSpread])

  // Hydrate inventory cards so repository sort by dexId / prices work
  useEffect(() => {
    if (!isRepository || entries.length === 0) return
    let cancelled = false
    const keys = entries.map((e) => e.key)
    void Promise.all(
      keys.slice(0, 200).map((key) => {
        const { lang: keyLang } = parseOwnedKey(key)
        return hydrateCard(keyLang ?? lang, key, Boolean(keyLang))
      }),
    ).then(() => {
      if (!cancelled) setPriceTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [isRepository, entries, lang])

  const canPrevPage = safeSpread > 0
  const canExtendPages = binder?.kind === 'custom'
  const canNextPage = safeSpread < totalSpreads - 1 || Boolean(canExtendPages)
  const pageNavLabel = `${safeSpread + 1} / ${totalSpreads}`

  const goPrevPage = useRef(() => {})
  const goNextPage = useRef(() => {})
  goPrevPage.current = () => {
    if (!canPrevPage) return
    setSpreadIndex((s) => Math.max(0, s - 1))
  }
  goNextPage.current = () => {
    if (!binder) return
    if (safeSpread < totalSpreads - 1) {
      setSpreadIndex(safeSpread + 1)
      return
    }
    if (binder.kind !== 'custom') return
    addPages(binder.id, 2)
    setSpreadIndex(totalSpreads)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (overlayOpen) return
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrevPage.current()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNextPage.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlayOpen])

  const dexSlot = useMemo(() => {
    if (!binder || !dexEdit) return null
    const slot = binder.pages[dexEdit.pageIndex]?.slots[dexEdit.slotIndex]
    return slot?.type === 'pokedex' ? slot : null
  }, [binder, dexEdit])

  const searchMatches = useMemo(() => {
    if (!binder || !search.trim()) return []
    const q = search.trim().toLowerCase()
    const out: { pageIndex: number; slotIndex: number; label: string }[] = []
    binder.pages.forEach((page, pageIndex) => {
      page.slots.forEach((slot, slotIndex) => {
        if (!slot) return
        if (slot.type === 'pokedex') {
          const name = getPokedexName(slot.dexId).toLowerCase()
          const num = String(slot.dexId)
          const top = slot.topCardId ? getCachedCard(baseCardId(slot.topCardId)) : undefined
          if (
            name.includes(q) ||
            num.includes(q) ||
            top?.name.toLowerCase().includes(q) ||
            top?.localId.toLowerCase().includes(q)
          ) {
            out.push({
              pageIndex,
              slotIndex,
              label: `#${String(slot.dexId).padStart(3, '0')} ${getPokedexName(slot.dexId)}`,
            })
          }
          return
        }
        const cached = getCachedCard(baseCardId(slot.cardId))
        if (
          cached?.name.toLowerCase().includes(q) ||
          cached?.localId.toLowerCase().includes(q) ||
          slot.cardId.toLowerCase().includes(q)
        ) {
          out.push({
            pageIndex,
            slotIndex,
            label: cached?.name ?? slot.cardId,
          })
        }
      })
    })
    return out
  }, [binder, search])

  const searchHits = useMemo(() => {
    const set = new Set<string>()
    for (const m of searchMatches) set.add(`p${m.pageIndex}-s${m.slotIndex}`)
    return set
  }, [searchMatches])

  const displayCardKeysSig = useMemo(() => {
    if (!binder) return ''
    const keys: string[] = []
    for (const page of binder.pages) {
      for (const slot of page.slots) {
        const id = slotDisplayCardId(slot)
        if (id) keys.push(id)
      }
    }
    return keys.join('\n')
  }, [binder])

  useEffect(() => {
    if (!displayCardKeysSig) return
    const keys = displayCardKeysSig.split('\n')
    let cancelled = false
    void Promise.all(
      keys.map((key) => {
        const { lang: keyLang } = parseOwnedKey(key)
        return hydrateCard(keyLang ?? lang, key, Boolean(keyLang))
      }),
    ).then(() => {
      if (!cancelled) setPriceTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [displayCardKeysSig, lang])

  const totalValueLabel = useMemo(() => {
    if (!binder) return null
    void priceTick
    const total =
      binder.kind === 'repository'
        ? inventoryTotalBrl(entries, binder.settings.priceMarket)
        : binderTotalBrl(binder)
    return total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }, [binder, priceTick, entries])

  const inventoryCountLabel = useMemo(() => {
    if (!binder || binder.kind !== 'repository') return null
    const n = inventoryCardCount(entries)
    return `${n} carta${n === 1 ? '' : 's'}`
  }, [binder, entries])

  const inspectSlot = inspectRef && binder
    ? binder.pages[inspectRef.pageIndex]?.slots[inspectRef.slotIndex]
    : null
  const inspectCardKey = slotDisplayCardId(inspectSlot ?? null)

  if (!binder || !leftPage) {
    return (
      <div className="missing">
        <p>Fichário não encontrado.</p>
        <Link to="/">Voltar</Link>
      </div>
    )
  }

  const currentBinder = binder
  const kindLabel =
    binder.kind === 'pokedex'
      ? 'Pokédex'
      : binder.kind === 'wishlist'
        ? 'Desejada'
        : binder.kind === 'repository'
          ? 'Repositório'
          : 'Personalizado'
  const showBatch = toolMode === 'select' && selected.size > 0
  const showTrayChrome = !overlayOpen && binder.kind === 'custom'

  function jumpTo(ref: SlotRef) {
    setSpreadIndex(Math.floor(ref.pageIndex / 2))
    setInspectRef(ref)
  }

  function toggleSelect(ref: SlotRef) {
    const key = `p${ref.pageIndex}-s${ref.slotIndex}`
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function sendToTray(ref: SlotRef) {
    if (currentBinder.kind !== 'custom') return
    const current = currentBinder.pages[ref.pageIndex]?.slots[ref.slotIndex] ?? null
    if (!current || current.type !== 'card') return
    if (current.pinned) return

    const slot = takeSlot(currentBinder.id, ref)
    if (!slot || slot.type !== 'card') return
    tray.addSlot(slot, {
      binderId: currentBinder.id,
      pageIndex: ref.pageIndex,
      slotIndex: ref.slotIndex,
    })
  }

  function placeFromTray(trayItemId: string, to: SlotRef) {
    if (currentBinder.kind !== 'custom') return
    const current = currentBinder.pages[to.pageIndex]?.slots[to.slotIndex] ?? null
    if (current && 'pinned' in current && current.pinned) return

    const item = tray.peekItem(trayItemId)
    if (!item) return

    // Swap: occupant goes to tray first, then place dragged card.
    if (current && current.type === 'card') {
      tray.takeItem(trayItemId)
      tray.addSlot(current, {
        binderId: currentBinder.id,
        pageIndex: to.pageIndex,
        slotIndex: to.slotIndex,
      })
      setSlot(currentBinder.id, to, item.slot)
      return
    }

    tray.takeItem(trayItemId)
    setSlot(currentBinder.id, to, item.slot)
  }

  return (
    <div
      className={`binder-view ${showTrayChrome ? 'has-tray' : ''} ${showBatch ? 'has-batch' : ''}`}
      data-binder-theme="mesa"
    >
      <div className="view-top">
        <button
          type="button"
          className="btn-ghost binder-home"
          disabled={!canPrevPage}
          onClick={() => setSpreadIndex(0)}
          title="Ir para o início do fichário"
        >
          ← Início
        </button>
        <h1>{binder.name}</h1>
        <div className="view-actions">
          {binder.kind === 'pokedex' || binder.kind === 'wishlist' ? (
            <button
              type="button"
              className="kind-pill kind-pill--action"
              onClick={() => setReorderOpen(true)}
              title="Reorganizar espécies"
            >
              {kindLabel}
            </button>
          ) : (
            <span className="kind-pill">{kindLabel}</span>
          )}
          {inventoryCountLabel && (
            <span className="binder-total" title="Quantidade total no inventário">
              {inventoryCountLabel}
            </span>
          )}
          {totalValueLabel && (
            <span
              className="binder-total"
              title={`Total estimado em BRL via câmbio (${binder.settings.priceMarket === 'tcgplayer' ? 'TCGPlayer' : 'Cardmarket'}) — não é preço do mercado brasileiro`}
            >
              Total estimado {totalValueLabel}
            </span>
          )}
          {binder.kind === 'repository' && (
            <Link to="/repository" className="btn-ghost">
              Editar quantidades
            </Link>
          )}
          <button type="button" className="btn-ghost" onClick={() => setSettingsOpen(true)}>
            Configurações
          </button>
          {binder.kind === 'custom' && (
            <button type="button" className="btn-ghost" onClick={() => addPages(binder.id, 2)}>
              + Páginas
            </button>
          )}
        </div>
      </div>

      <div className="binder-layout">
        <ToolsSidebar
          binder={binder}
          mode={toolMode}
          onMode={(m) => {
            setToolMode(m)
            if (m !== 'select') setSelected(new Set())
          }}
          selectedCount={selected.size}
          search={search}
          onSearch={setSearch}
          matches={searchMatches}
          onJump={jumpTo}
          onReorder={(from, to) => reorderPages(binder.id, from, to)}
          canReorder={binder.kind === 'custom'}
        />

        <div className="binder-main">
          <div className="pager" role="navigation" aria-label="Páginas do fichário">
            <button
              type="button"
              disabled={!canPrevPage}
              onClick={() => setSpreadIndex(0)}
              aria-label="Primeira abertura"
            >
              «
            </button>
            <button
              type="button"
              disabled={!canPrevPage}
              onClick={() => goPrevPage.current()}
              aria-label="Abertura anterior"
            >
              ‹
            </button>
            <span aria-live="polite">{pageNavLabel}</span>
            <button
              type="button"
              disabled={!canNextPage}
              onClick={() => goNextPage.current()}
              aria-label="Próxima abertura"
              title={
                canExtendPages && safeSpread >= totalSpreads - 1
                  ? 'Adiciona uma nova abertura e salva'
                  : undefined
              }
            >
              ›
            </button>
            <button
              type="button"
              disabled={safeSpread >= totalSpreads - 1}
              onClick={() => setSpreadIndex(totalSpreads - 1)}
              aria-label="Última abertura"
            >
              »
            </button>
          </div>

          <BinderSpread
            binder={binder}
            leftPage={leftPage}
            rightPage={rightPage}
            leftIndex={leftIndex}
            rightIndex={rightIndex}
            canPrevPage={canPrevPage}
            canNextPage={canNextPage}
            pageLabel={pageNavLabel}
            onPrevPage={() => goPrevPage.current()}
            onNextPage={() => goNextPage.current()}
            selectMode={toolMode === 'select'}
            selected={selected}
            searchHits={toolMode === 'search' ? searchHits : undefined}
            onSwap={(from, to) => swapSlot(binder.id, from, to)}
            onDropSlotToTray={sendToTray}
            onDropTrayToSlot={placeFromTray}
            onLabelChange={(pageIndex, label) => setPageLabel(binder.id, pageIndex, label)}
            onDeletePage={(pageIndex) => {
              if (
                binder.kind === 'pokedex' ||
                binder.kind === 'wishlist' ||
                binder.kind === 'repository'
              ) {
                return
              }
              if (window.confirm('Limpar slots desta página?')) clearPage(binder.id, pageIndex)
            }}
            onSelect={toggleSelect}
            onActivate={(ref) => {
              const slot = binder.pages[ref.pageIndex]?.slots[ref.slotIndex]
              setInspectRef(ref)
              if (slot?.type === 'pokedex') {
                setDexEdit(ref)
                return
              }
              if (binder.kind === 'repository') {
                if (slot?.type === 'card') setDetailsKey(slot.cardId)
                return
              }
              if (binder.kind === 'custom') {
                if (slot?.type === 'card') {
                  setDetailsKey(slot.cardId)
                } else {
                  setReplaceRef(null)
                  setAddOpen(true)
                }
              }
            }}
            onRemove={
              binder.kind === 'repository'
                ? undefined
                : (ref) => clearSlot(binder.id, ref)
            }
            onToTray={binder.kind === 'custom' ? sendToTray : undefined}
            onReplace={
              binder.kind === 'repository'
                ? undefined
                : (ref) => {
                    const slot = binder.pages[ref.pageIndex]?.slots[ref.slotIndex]
                    setInspectRef(ref)
                    if (slot?.type === 'pokedex') {
                      setDexEdit(ref)
                      return
                    }
                    setReplaceRef(ref)
                    setAddOpen(true)
                  }
            }
            onEdit={(ref) => {
              const slot = binder.pages[ref.pageIndex]?.slots[ref.slotIndex]
              setInspectRef(ref)
              if (slot?.type === 'pokedex') {
                setDexEdit(ref)
                return
              }
              const key = slotDisplayCardId(slot ?? null)
              if (key) setDetailsKey(key)
            }}
            onPin={
              binder.kind === 'repository'
                ? undefined
                : (ref) => togglePin(binder.id, ref)
            }
            onMarkMissing={
              binder.kind === 'repository'
                ? undefined
                : (ref) => {
              if (binder.kind === 'wishlist') {
                const s = binder.pages[ref.pageIndex]?.slots[ref.slotIndex]
                if (s?.type !== 'pokedex' || !s.topCardId) return
                const nextObtained = !s.obtained
                updatePokedexSlot(binder.id, ref.pageIndex, ref.slotIndex, {
                  obtained: nextObtained,
                })
                return
              }
              markSlotMissing(binder.id, ref)
            }
            }
            onDetails={(ref) => {
              const slot = binder.pages[ref.pageIndex]?.slots[ref.slotIndex]
              const key = slotDisplayCardId(slot ?? null)
              if (key) setDetailsKey(key)
              setInspectRef(ref)
            }}
            showTray={showTrayChrome && binder.kind === 'custom'}
          />
        </div>

        <aside className="inspect-panel" aria-label="Painel da carta">
          <h3>Selecionada</h3>
          {inspectCardKey ? (
            <>
              {getCachedCard(baseCardId(inspectCardKey))?.image && (
                <CardImage
                  src={getCachedCard(baseCardId(inspectCardKey))!.image}
                  alt=""
                  quality="high"
                  className="inspect-img"
                />
              )}
              <p className="inspect-name">
                {getCachedCard(baseCardId(inspectCardKey))?.name ?? 'Carta'}
              </p>
              <p className="inspect-set">
                {getCachedCard(baseCardId(inspectCardKey))?.setName
                  ? `Coleção: ${getCachedCard(baseCardId(inspectCardKey))!.setName}`
                  : 'Coleção desconhecida'}
              </p>
              <p className="inspect-set">
                ID set:{' '}
                {getCachedCard(baseCardId(inspectCardKey))?.setId ?? '—'}
              </p>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setDetailsKey(inspectCardKey)}
              >
                Ver detalhes
              </button>
            </>
          ) : (
            <p className="muted">Clique numa carta ou abra o menu ⋯ no slot.</p>
          )}
        </aside>
      </div>

      {binder.kind === 'custom' && (
        <button
          type="button"
          className="fab"
          onClick={() => {
            setReplaceRef(null)
            setAddOpen(true)
          }}
          aria-label="Adicionar cartas"
        >
          +
        </button>
      )}

      {showBatch && (
        <div className="batch-bar">
          <button
            type="button"
            onClick={() => {
              for (const key of selected) {
                const m = /^p(\d+)-s(\d+)$/.exec(key)
                if (!m) continue
                sendToTray({ pageIndex: Number(m[1]), slotIndex: Number(m[2]) })
              }
              setSelected(new Set())
            }}
          >
            Mover {selected.size} para a bandeja
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              for (const key of selected) {
                const m = /^p(\d+)-s(\d+)$/.exec(key)
                if (!m) continue
                clearSlot(binder.id, {
                  pageIndex: Number(m[1]),
                  slotIndex: Number(m[2]),
                })
              }
              setSelected(new Set())
            }}
          >
            Remover selecionadas
          </button>
        </div>
      )}

      <BinderSettings
        binder={binder}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        adapters={{
          updateSettings: (patch) => updateSettings(binder.id, patch),
          setGrid: (grid) => setGrid(binder.id, grid),
          addPages: (count) => addPages(binder.id, count),
          renameBinder: (name) => renameBinder(binder.id, name),
          progress: () => {
            let filled = 0
            let slots = 0
            for (const p of binder.pages) {
              slots += p.slots.length
              filled += p.slots.filter(Boolean).length
            }
            return { owned: 0, total: 0, filled, slots }
          },
        }}
      />

      <AddCardsModal
        open={addOpen}
        replaceMode={Boolean(replaceRef)}
        onClose={() => {
          setAddOpen(false)
          setReplaceRef(null)
        }}
        onAdd={(cardIds) => {
          if (replaceRef && cardIds[0]) {
            setSlot(binder.id, replaceRef, { type: 'card', cardId: cardIds[0] })
            setReplaceRef(null)
            return
          }
          addCardsToPage(binder.id, leftIndex, cardIds)
        }}
      />

      {dexSlot && dexEdit && (
        <PokedexPanel
          open
          slot={dexSlot}
          settings={binder.settings}
          mode={binder.kind === 'wishlist' ? 'wishlist' : 'collection'}
          onClose={() => setDexEdit(null)}
          onChange={(patch) => {
            updatePokedexSlot(binder.id, dexEdit.pageIndex, dexEdit.slotIndex, patch)
          }}
        />
      )}

      {detailsKey && (
        <CardDetailsModal
          open
          cardKey={detailsKey}
          settings={binder.settings}
          ownedKeys={
            inspectSlot?.type === 'pokedex' ? inspectSlot.ownedCardIds : undefined
          }
          onClose={() => setDetailsKey(null)}
        />
      )}

      {(binder.kind === 'pokedex' || binder.kind === 'wishlist') && (
        <PokedexReorderModal
          open={reorderOpen}
          binder={binder}
          onClose={() => setReorderOpen(false)}
          onSave={(orderedDexIds) => reorderPokedexSlots(binder.id, orderedDexIds)}
        />
      )}
    </div>
  )
}
