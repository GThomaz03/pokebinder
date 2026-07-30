import { useEffect, useRef } from 'react'

/** Executa callback após delay ms sem mudanças em deps. */
export function useDebouncedEffect(
  callback: () => void | Promise<void>,
  deps: unknown[],
  delay = 1500,
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void callbackRef.current()
    }, delay)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
