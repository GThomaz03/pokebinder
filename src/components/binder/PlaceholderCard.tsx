import { getPokedexName } from '../../lib/binderUtils'
import { DexSprite, type DexSpriteVariant } from './DexSprite'

export type PlaceholderContent = 'text' | 'image'
export type PlaceholderImageStyle = DexSpriteVariant

type Props = {
  dexId: number | null
  content: PlaceholderContent
  imageStyle: PlaceholderImageStyle
  marked?: boolean
  onToggle?: () => void
  interactive?: boolean
}

export function PlaceholderCard({
  dexId,
  content,
  imageStyle,
  marked = false,
  onToggle,
  interactive = false,
}: Props) {
  if (dexId == null) {
    return <div className="ph-card ph-card--empty" aria-hidden />
  }

  const name = getPokedexName(dexId)
  const num = `#${String(dexId).padStart(3, '0')}`
  const className = [
    'ph-card',
    content === 'image' ? 'ph-card--image' : 'ph-card--text',
    marked ? 'is-marked' : '',
    interactive ? 'is-interactive' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      {content === 'image' ? (
        <>
          <span className="ph-card-art">
            <DexSprite dexId={dexId} variant={imageStyle} alt={name} />
          </span>
          <span className="ph-card-meta">
            <strong>{num}</strong>
            <em title={name}>{name}</em>
          </span>
        </>
      ) : (
        <span className="ph-card-text">
          <strong>{num}</strong>
          <em title={name}>{name}</em>
        </span>
      )}
      {marked && <span className="ph-card-x" aria-hidden>×</span>}
    </>
  )

  if (interactive && onToggle) {
    return (
      <button
        type="button"
        className={className}
        onClick={onToggle}
        aria-pressed={marked}
        aria-label={
          marked
            ? `Desmarcar exclusão de ${num} ${name}`
            : `Marcar ${num} ${name} para excluir`
        }
      >
        {inner}
      </button>
    )
  }

  return <div className={className}>{inner}</div>
}
