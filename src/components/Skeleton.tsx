import type { CSSProperties } from 'react'
import './Skeleton.css'

type SkeletonProps = {
  className?: string
  /** Accessible label while loading */
  label?: string
  style?: CSSProperties
}

/** Shimmer block — base for all loading placeholders. */
export function Skeleton({ className = '', label = 'Carregando', style }: SkeletonProps) {
  return (
    <span
      className={`sk ${className}`.trim()}
      style={style}
      role="status"
      aria-label={label}
    />
  )
}

/** Card-proportion placeholder (63:88). */
export function CardSkeleton({ className = '', label }: { className?: string; label?: string }) {
  return <Skeleton className={`sk-card ${className}`.trim()} label={label ?? 'Carregando carta'} />
}

export function CardSkeletonGrid({
  count = 12,
  className = '',
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={`sk-card-grid ${className}`.trim()} aria-busy aria-label="Carregando cartas">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sk-card-cell">
          <CardSkeleton />
          <Skeleton className="sk-line sk-line--title" />
          <Skeleton className="sk-line sk-line--meta" />
        </div>
      ))}
    </div>
  )
}

/** Set / collection card placeholder (Browse / Repository style). */
export function SetCardSkeleton() {
  return (
    <div className="sk-set-card" aria-hidden>
      <div className="sk-set-top">
        <Skeleton className="sk-chip" />
        <Skeleton className="sk-line sk-line--grow" />
      </div>
      <div className="sk-set-body">
        <Skeleton className="sk-logo" />
        <div className="sk-set-stats">
          <Skeleton className="sk-line sk-line--meta" />
          <Skeleton className="sk-line sk-line--meta" />
        </div>
      </div>
      <Skeleton className="sk-bar" />
    </div>
  )
}

export function SetSkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="sk-set-grid" aria-busy aria-label="Carregando coleções">
      {Array.from({ length: count }, (_, i) => (
        <SetCardSkeleton key={i} />
      ))}
    </div>
  )
}

/** Horizontal result row (search / deck builder). */
export function ResultRowSkeleton() {
  return (
    <div className="sk-result-row" aria-hidden>
      <CardSkeleton className="sk-result-thumb" />
      <div className="sk-result-meta">
        <Skeleton className="sk-line sk-line--title" />
        <Skeleton className="sk-line sk-line--meta" />
      </div>
    </div>
  )
}

export function ResultRowSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="sk-result-grid" aria-busy aria-label="Carregando resultados">
      {Array.from({ length: count }, (_, i) => (
        <ResultRowSkeleton key={i} />
      ))}
    </div>
  )
}
