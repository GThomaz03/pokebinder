import { useEffect, useState } from 'react'
import '../Skeleton.css'
import './DexSprite.css'

const ART_URL = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
const FALLBACK_URL = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

type Props = {
  dexId: number
  className?: string
  alt?: string
}

/** Official Pokémon artwork with simple sprite fallback. */
export function DexSprite({ dexId, className = '', alt = '' }: Props) {
  const [phase, setPhase] = useState<'art' | 'fallback' | 'empty'>('art')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setPhase('art')
    setLoaded(false)
  }, [dexId])

  const src = phase === 'fallback' ? FALLBACK_URL(dexId) : ART_URL(dexId)

  return (
    <span className={`dex-sprite ${className}`.trim()} data-dex={dexId}>
      {!loaded && phase !== 'empty' && <span className="sk sk-fill" aria-hidden />}
      {phase !== 'empty' ? (
        <img
          key={`${dexId}-${phase}`}
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          className={loaded ? 'is-shown' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (phase === 'art') {
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
