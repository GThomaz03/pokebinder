import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clearCachedImageUrl,
  getCachedImageUrl,
  imageCacheKey,
  setCachedImageUrl,
} from '../api/imageCache'
import { cardImageCandidates, inferMissingImageCandidates } from '../api/images/imageProvider'
import './Skeleton.css'

type Props = {
  /** Image base from TCGdex (`…/pt/ex/ex6/113`) or a full URL (`…/low.webp`) */
  src?: string | null
  alt?: string
  quality?: 'high' | 'low'
  className?: string
  loading?: 'lazy' | 'eager'
  draggable?: boolean
  /** Used to infer art when TCGdex has no image (basic Energy, etc.) */
  cardId?: string
  localId?: string | number
  cardName?: string
  energyType?: string
}

function buildCandidates(
  src: string | null | undefined,
  quality: 'high' | 'low',
  meta?: {
    cardId?: string
    localId?: string | number
    cardName?: string
    energyType?: string
  },
): string[] {
  const urls: string[] = []

  if (src) {
    // Expand base OR full URLs into locale/quality/format matrix.
    // Raw TCGdex bases without /high.webp|/low.webp always 404 on the CDN.
    for (const u of cardImageCandidates(src, quality)) {
      if (!urls.includes(u)) urls.push(u)
    }
  }

  if (meta?.cardId) {
    for (const u of inferMissingImageCandidates({
      cardId: meta.cardId,
      name: meta.cardName,
      localId: meta.localId,
      energyType: meta.energyType,
    })) {
      if (!urls.includes(u)) urls.push(u)
    }
  }

  return urls
}

/**
 * Card art with locale → English fallback, plus PokémonTCG.io / basic-energy
 * stand-ins when TCGdex omits `image` (common for Energy cards).
 * Successful URLs are cached so remounts don't re-walk failing candidates.
 * Shows a shimmer skeleton until the active candidate finishes loading.
 */
export function CardImage({
  src,
  alt = '',
  quality = 'low',
  className,
  loading = 'lazy',
  draggable = false,
  cardId,
  localId,
  cardName,
  energyType,
}: Props) {
  const srcKey = src ?? ''
  const cardKey = cardId ?? ''
  const cacheKey = imageCacheKey({ src, cardId, quality })

  const candidates = useMemo(() => {
    const list = buildCandidates(src, quality, {
      cardId,
      localId,
      cardName,
      energyType,
    })
    const hit = getCachedImageUrl(cacheKey)
    // Only prefer a remembered URL if it is still one of our candidates.
    // Foreign/stale hits (e.g. old 404 paths) must not jump the queue.
    if (hit && list.includes(hit)) return [hit, ...list.filter((u) => u !== hit)]
    if (hit && !list.includes(hit)) clearCachedImageUrl(cacheKey, hit)
    return list
  }, [src, quality, cardId, localId, cardName, energyType, cacheKey])

  const [index, setIndex] = useState(0)
  const [exhausted, setExhausted] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const intendedRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    setIndex(0)
    setExhausted(false)
    setLoaded(false)
  }, [srcKey, quality, cardKey, cacheKey])

  const current = candidates[index]
  intendedRef.current = current

  useEffect(() => {
    setLoaded(false)
  }, [current])

  const rootClass = [
    'card-img-root',
    className,
    !current || exhausted ? 'is-empty' : '',
    current && !exhausted && !loaded ? 'is-loading' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (!current || exhausted) {
    return (
      <span className={rootClass || 'card-img-root is-empty'} aria-hidden>
        <span className="ph" />
      </span>
    )
  }

  return (
    <span className={rootClass} aria-busy={!loaded}>
      {!loaded && <span className="sk sk-fill" aria-hidden />}
      <img
        // Remount per URL so an aborted previous load cannot fire onError on the next candidate.
        key={current}
        className={`card-img-el${loaded ? ' is-shown' : ''}`}
        src={current}
        alt={alt}
        loading={loading}
        draggable={draggable}
        onLoad={() => {
          setLoaded(true)
          setCachedImageUrl(cacheKey, current)
        }}
        onError={() => {
          // Advance whenever this img (keyed to `current`) fails. Avoid brittle
          // href string compares that can stall the fallback chain.
          if (intendedRef.current !== current) return
          clearCachedImageUrl(cacheKey, current)
          setLoaded(false)
          if (index + 1 < candidates.length) setIndex(index + 1)
          else setExhausted(true)
        }}
      />
    </span>
  )
}
