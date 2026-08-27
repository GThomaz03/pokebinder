import { useEffect, useState } from 'react'
import '../Skeleton.css'
import './DexSprite.css'

const ART_URL = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
const PIXEL_URL = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

export type DexSpriteVariant = 'art' | 'pixel'

type Props = {
  dexId: number
  className?: string
  alt?: string
  /** Official artwork (default) or classic pixel sprite. */
  variant?: DexSpriteVariant
}

/** Pokémon artwork with optional pixel sprite mode. */
export function DexSprite({
  dexId,
  className = '',
  alt = '',
  variant = 'art',
}: Props) {
  const [phase, setPhase] = useState<'primary' | 'fallback' | 'empty'>('primary')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setPhase('primary')
    setLoaded(false)
  }, [dexId, variant])

  const primaryUrl = variant === 'pixel' ? PIXEL_URL(dexId) : ART_URL(dexId)
  const fallbackUrl = variant === 'pixel' ? ART_URL(dexId) : PIXEL_URL(dexId)
  const src = phase === 'fallback' ? fallbackUrl : primaryUrl

  return (
    <span
      className={`dex-sprite${variant === 'pixel' ? ' is-pixel' : ''} ${className}`.trim()}
      data-dex={dexId}
    >
      {!loaded && phase !== 'empty' && <span className="sk sk-fill" aria-hidden />}
      {phase !== 'empty' ? (
        <img
          key={`${dexId}-${variant}-${phase}`}
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          className={loaded ? 'is-shown' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (phase === 'primary') {
              setLoaded(false)
              setPhase('fallback')
            } else {
              setPhase('empty')
              setLoaded(false)
            }
          }}
        />
      ) : (
        <span className="dex-sprite-ph" aria-hidden />
      )}
    </span>
  )
}
