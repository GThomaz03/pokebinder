import { useEffect, useMemo, useState } from 'react'
import {
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
    if (!hit) return list
    if (list.includes(hit)) return [hit, ...list.filter((u) => u !== hit)]
    return [hit, ...list]
  }, [src, quality, cardId, localId, cardName, energyType, cacheKey])

  const [index, setIndex] = useState(0)

  // Keep dep array size/order stable (avoids React warning across HMR / prop shapes).
  useEffect(() => {
    setIndex(0)
  }, [srcKey, quality, cardKey])

  const current = candidates[index]

  if (!current) {
    return <span className={className ? `${className} ph` : 'ph'} aria-hidden />
  }

  return (
    <img
      className={className}
      src={current}
      alt={alt}
      loading={loading}
      draggable={draggable}
      onLoad={() => {
        setCachedImageUrl(cacheKey, current)
      }}
      onError={() => {
        setIndex((i) => (i + 1 < candidates.length ? i + 1 : i))
      }}
    />
  )
}
