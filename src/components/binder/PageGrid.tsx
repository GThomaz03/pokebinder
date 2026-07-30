import type { ReactNode } from 'react'
import { useFitBox } from '../../hooks/useFitBox'
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
 * `.page-grid-wrap` fills leftover space in PagePanel; useFitBox measures
 * it and sizes `.page-grid` to the largest box of `aspect` that fits.
 */
export function PageGrid({ cols, rows, aspect, children }: Props) {
  const { ref, size } = useFitBox(aspect)

  return (
    <div className="page-grid-wrap" ref={ref}>
      <div
        className="page-grid"
        style={{
          ['--cols' as string]: cols,
          ['--rows' as string]: rows,
          width: size ? `${size.width}px` : undefined,
          height: size ? `${size.height}px` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  )
}
