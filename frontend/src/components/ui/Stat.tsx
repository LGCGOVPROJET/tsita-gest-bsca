import type { ReactNode } from 'react';

export function StatList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <dl className="stats" aria-label={label}>
      {children}
    </dl>
  );
}

/** `stacked` : libellé au-dessus, valeur alignée à gauche (textes longs, écrans étroits). */
export function Stat({ label, children, stacked }: { label: ReactNode; children: ReactNode; stacked?: boolean }) {
  return (
    <div className={`stat${stacked ? ' stacked' : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
