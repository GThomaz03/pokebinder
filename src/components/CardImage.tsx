import { useEffect, useMemo, useState } from 'react'
import {
  clearCachedImageUrl,
  getCachedImageUrl,
  imageCacheKey,
  setCachedImageUrl,
} from '../api/imageCache'
import { cardImageCandidates, inferMissingImageCandidates } from '../api/tcgdex'

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
    if (/\.(webp|png|jpg|jpeg)(\?.*)?$/i.test(src)) {
      urls.push(src)
      const en = src.replace(/\/(pt|ja)\//i, '/en/')
      if (en !== src) urls.push(en)
      const flipped = en.replace(/\/(low|high)\./i, (_, q: string) =>
        q.toLowerCase() === 'low' ? '/high.' : '/low.',
      )
      if (!urls.includes(flipped)) urls.push(flipped)
    } else {
      urls.push(...cardImageCandidates(src, quality))
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

function normalizeImgSrc(url: string): string {
  try {
    return new URL(url, typeof window !== 'undefined' ? window.location.href : 'https://local')
      .href
  } catch {
    return url
  }
}

/**
 * Card art with locale → English fallback, plus PokémonTCG.io / basic-energy
 * stand-ins when TCGdex omits `image` (common for Energy cards).
 * Successful URLs are cached so remounts don't re-walk failing candidates.
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

  useEffect(() => {
    setIndex(0)
    setExhausted(false)
  }, [srcKey, quality, cardKey, cacheKey])

  const current = candidates[index]

  if (!current || exhausted) {
    return <span className={className ? `${className} ph` : 'ph'} aria-hidden />
  }

  return (
    <img
      // Remount per URL so an aborted previous load cannot fire onError on the next candidate.
      key={current}
      className={className}
      src={current}
      alt={alt}
      loading={loading}
      draggable={draggable}
      onLoad={() => {
        setCachedImageUrl(cacheKey, current)
      }}
      onError={(e) => {
        const failed = normalizeImgSrc((e.currentTarget as HTMLImageElement).src)
        const expected = normalizeImgSrc(current)
        // Ignore stale/aborted errors that don't match the URL we intended to show.
        if (failed !== expected) return

        clearCachedImageUrl(cacheKey, current)
        if (index + 1 < candidates.length) setIndex(index + 1)
        else setExhausted(true)
      }}
    />
  )
}
