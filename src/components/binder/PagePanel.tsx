import type { Binder, BinderPage, SlotRef } from '../../types'
import { gridCols, gridRows, pageGridAspect, slotsPerPage } from '../../types'
import { BinderSlot } from './BinderSlot'
import { PageGrid } from './PageGrid'
import { PageToolbar } from './PageToolbar'
import './PagePanel.css'

type PagePanelProps = {
  page: BinderPage
  pageIndex: number
  binder: Binder
  selectMode?: boolean
  selected?: Set<string>
  searchHits?: Set<string>
  onActivate: (ref: SlotRef) => void
  onSelect?: (ref: SlotRef) => void
  onRemove?: (ref: SlotRef) => void
  onToTray?: (ref: SlotRef) => void
  onReplace?: (ref: SlotRef) => void
  onPin?: (ref: SlotRef) => void
  onEdit?: (ref: SlotRef) => void
  onMarkMissing?: (ref: SlotRef) => void
  onDetails?: (ref: SlotRef) => void
  onLabelChange: (pageIndex: number, label: string) => void
  onDeletePage: (pageIndex: number) => void
}

/**
 * One page of the binder.
 *
 * Layout: `display: flex; flex-direction: column` with exactly two
 * children — a fixed-height PageToolbar (`flex: 0 0 auto`) and a
 * PageGrid that absorbs the rest (`flex: 1 1 0; min-height: 0`). The
 * panel itself never sets `height: 100%`; it stretches to fill its grid
 * cell in `.spread` instead (see BinderSpread.css).
 */
export function PagePanel({
  page,
  pageIndex,
  binder,
  selectMode,
  selected,
  searchHits,
  onActivate,
  onSelect,
  onRemove,
  onToTray,
  onReplace,
  onPin,
  onEdit,
  onMarkMissing,
  onDetails,
  onLabelChange,
  onDeletePage,
}: PagePanelProps) {
  const cols = gridCols(binder.grid)
  const rows = gridRows(binder.grid)
  const aspect = pageGridAspect(binder.grid)

  return (
    <section className="page-panel">
      <PageToolbar
        label={page.label}
        onLabelChange={(label) => onLabelChange(pageIndex, label)}
        onClear={() => onDeletePage(pageIndex)}
      />

      <PageGrid cols={cols} rows={rows} aspect={aspect}>
        {page.slots.map((slot, slotIndex) => {
          const ref = { pageIndex, slotIndex }
          const id = `p${pageIndex}-s${slotIndex}`
          return (
            <BinderSlot
              key={`${page.id}-${slotIndex}`}
              slotRef={ref}
              slot={slot}
              binder={binder}
              settings={binder.settings}
              selectMode={selectMode}
              selected={selected?.has(id)}
              searchHit={searchHits?.has(id)}
              onActivate={() => onActivate(ref)}
              onSelect={() => onSelect?.(ref)}
              onRemove={() => onRemove?.(ref)}
              onToTray={() => onToTray?.(ref)}
              onReplace={() => onReplace?.(ref)}
              onPin={() => onPin?.(ref)}
              onEdit={() => onEdit?.(ref)}
              onMarkMissing={() => onMarkMissing?.(ref)}
              onDetails={() => onDetails?.(ref)}
            />
          )
        })}
      </PageGrid>
    </section>
  )
}

/** Ghost page shown on the right when a binder has an odd number of pages. */
export function PagePlaceholder({ binder }: { binder: Binder }) {
  const cols = gridCols(binder.grid)
  const rows = gridRows(binder.grid)
  const aspect = pageGridAspect(binder.grid)

  return (
    <section className="page-panel is-placeholder" aria-hidden>
      <PageToolbar placeholder />
      <PageGrid cols={cols} rows={rows} aspect={aspect}>
        {Array.from({ length: slotsPerPage(binder.grid) }, (_, i) => (
          <div key={`ph-${i}`} className="b-slot is-placeholder">
            <span className="b-slot-frame">
              <span className="empty-mark" />
            </span>
          </div>
        ))}
      </PageGrid>
    </section>
  )
}
