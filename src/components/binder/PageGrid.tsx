import type { ReactNode } from 'react'
import './PageGrid.css'

type Props = {
  cols: number
  rows: number
  aspect: number
  children: ReactNode
}

/**
 * The card grid for a single page.
 *
 * Structure: `.page-grid-wrap` (fills leftover space in PagePanel and
 * establishes a size container) → `.page-grid` (fitted to `aspect` with
 * container query units so it never feeds back into the wrap's height).
 *
 * Because `.page-grid` is sized to the page aspect before the cols×rows
 * tracks split it, every cell is already card-shaped.
 */
export function PageGrid({ cols, rows, aspect, children }: Props) {
  const style = {
    ['--cols' as string]: cols,
    ['--rows' as string]: rows,
    ['--page-aspect' as string]: aspect,
  }

  return (
    <div className="page-grid-wrap">
      <div className="page-grid" style={style}>
        {children}
      </div>
    </div>
  )
}
