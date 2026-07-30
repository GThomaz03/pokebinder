import { useLayoutEffect, useRef, useState } from 'react'

type FitSize = { width: number; height: number }

/**
 * Measures the wrapper element and returns the largest width/height (in px)
 * that fits inside it while preserving `aspect` (width / height).
 *
 * This avoids relying on CSS aspect-ratio auto-sizing inside flex/grid
 * contexts (which has proven fragile across the various layout chains this
 * app nests binder pages in) and container query units (limited support).
 * Measuring with ResizeObserver is deterministic and works at every
 * viewport size.
 */
export function useFitBox(aspect: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<FitSize | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    function fit(w: number, h: number) {
      if (w <= 0 || h <= 0) return
      let width = w
      let height = width / aspect
      if (height > h) {
        height = h
        width = height * aspect
      }
      setSize({ width: Math.max(0, Math.floor(width)), height: Math.max(0, Math.floor(height)) })
    }

    fit(el.clientWidth, el.clientHeight)

    if (typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const box = entry.contentBoxSize?.[0]
      if (box) {
        fit(box.inlineSize, box.blockSize)
      } else {
        fit(entry.contentRect.width, entry.contentRect.height)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  return { ref, size }
}
