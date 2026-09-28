import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { InfoTip } from './Tooltip';
import { formatNumber } from '@/lib/format';

interface KpiCardProps {
  label: string;
  value: number | null | undefined;
  foot?: ReactNode;
  definition?: string;
  icon: LucideIcon;
  tone?: 'blue' | 'red' | 'amber' | 'green' | 'danger';
  to?: string;
  linkLabel?: string;
  loading?: boolean;
  /** Valeur mise en forme à la place du nombre (ex. ratio « 20 / 38 · 52,6 % »). */
  display?: ReactNode;
  /** Carte secondaire, plus basse. */
  compact?: boolean;
}

export function KpiCard({
  label,
  value,
  foot,
  definition,
  icon: Icon,
  tone = 'blue',
  to,
  linkLabel,
  loading,
  display,
  compact,
}: KpiCardProps) {
  return (
    <article className={`card kpi ${tone === 'blue' ? '' : tone}${compact ? ' compact' : ''}`} aria-busy={loading || undefined}>
      <span className="kpi-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <h2 className="k-label" style={{ margin: 0, fontFamily: 'var(--font-text)' }}>
        {label}
        {definition && <InfoTip label={`Définition : ${label}`}>{definition}</InfoTip>}
      </h2>
      <div className="number">
        {loading ? (
          <span className="skeleton" style={{ width: 70, height: compact ? 26 : 34, display: 'inline-block' }} />
        ) : (
          (display ?? formatNumber(value))
        )}
      </div>
      {foot && <small>{foot}</small>}
      {to && (
        <Link className="kpi-link" to={to}>
          {linkLabel ?? 'Voir les dossiers'} →
        </Link>
      )}
    </article>
  );
}
