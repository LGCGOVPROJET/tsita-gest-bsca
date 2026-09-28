import type { CSSProperties } from 'react';

export function Skeleton({ width = '100%', height = 14, style, className }: { width?: number | string; height?: number | string; style?: CSSProperties; className?: string }) {
  return <span aria-hidden="true" className={`skeleton ${className ?? ''}`} style={{ width, height, ...style }} />;
}

export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Chargement en cours">
      <span className="sr-only">Chargement en cours…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, padding: '14px 4px', borderBottom: '1px solid var(--line-soft)' }}>
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} width={j === 0 ? '80%' : `${50 + ((i * 7 + j * 13) % 45)}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 4 }: { lines?: number }) {
  return (
    <div className="card" role="status" aria-label="Chargement en cours">
      <span className="sr-only">Chargement en cours…</span>
      <Skeleton width="40%" height={18} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={`${60 + ((i * 17) % 38)}%`} style={{ marginTop: 14 }} />
      ))}
    </div>
  );
}
