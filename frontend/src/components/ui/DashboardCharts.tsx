import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '@/lib/format';

export interface MonthlyPoint {
  month: string;
  label: string;
  received: number;
  responded: number;
}

/** Largeur réelle d'un conteneur (le graphique est dessiné à l'échelle 1:1, texte lisible sur tous les écrans). */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Maximum « rond » pour l'axe vertical (1, 2, 2,5, 5 × 10ⁿ). */
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

/** Graduations entières et régulières (ex. 50 → 0, 10, 20, 30, 40, 50). */
function axisTicks(max: number): number[] {
  const parts = [4, 5, 2].find((n) => Number.isInteger(max / n)) ?? 1;
  return Array.from({ length: parts + 1 }, (_, i) => (max / parts) * i);
}

/**
 * Évolution mensuelle reçues / réponses : barres groupées, axe gradué, survol et focus clavier,
 * résumé textuel et tableau de données (accessibilité).
 */
export function TrendChart({ data, caption, height = 290 }: { data: MonthlyPoint[]; caption: string; height?: number }) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const max = niceMax(Math.max(0, ...data.flatMap((d) => [d.received, d.responded])));
  const pad = { top: 16, right: 8, bottom: 30, left: 38 };
  const w = Math.max(width, 280);
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const band = data.length ? innerW / data.length : innerW;
  const barW = Math.max(6, Math.min(26, band * 0.28));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = axisTicks(max);
  const labelEvery = band < 34 ? 2 : 1;

  const totalR = data.reduce((s, d) => s + d.received, 0);
  const totalS = data.reduce((s, d) => s + d.responded, 0);
  const peak = data.reduce<MonthlyPoint | null>((p, d) => (!p || d.received > p.received ? d : p), null);
  const summary =
    data.length === 0
      ? 'Aucune donnée mensuelle pour cette sélection.'
      : `Sur ${data.length} mois, ${formatNumber(totalR)} réclamations reçues et ${formatNumber(totalS)} réponses envoyées.` +
        (peak ? ` Pic de réception en ${peak.label} (${formatNumber(peak.received)}).` : '');
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="trend" style={{ margin: 0 }}>
      <div className="trend-canvas" ref={wrapRef} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={w} height={height} role="img" aria-label={`${caption}. ${summary}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="trend-grid" x1={pad.left} x2={w - pad.right} y1={y(t)} y2={y(t)} />
                <text className="trend-axis" x={pad.left - 8} y={y(t) + 4} textAnchor="end">
                  {formatNumber(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.left + band * i + band / 2;
              const active = hover === i;
              return (
                <g key={d.month} className={`trend-col${active ? ' active' : ''}`} onMouseEnter={() => setHover(i)}>
                  <rect className="trend-band" x={pad.left + band * i + 2} y={pad.top} width={band - 4} height={innerH} rx={8} />
                  <rect
                    className="trend-bar received"
                    x={cx - barW - 2}
                    y={y(d.received)}
                    width={barW}
                    height={Math.max(0, pad.top + innerH - y(d.received))}
                    rx={Math.min(5, barW / 2)}
                    style={{ animationDelay: `${i * 45}ms` }}
                  />
                  <rect
                    className="trend-bar responded"
                    x={cx + 2}
                    y={y(d.responded)}
                    width={barW}
                    height={Math.max(0, pad.top + innerH - y(d.responded))}
                    rx={Math.min(5, barW / 2)}
                    style={{ animationDelay: `${i * 45 + 80}ms` }}
                  />
                  {i % labelEvery === 0 && (
                    <text className={`trend-axis month${active ? ' active' : ''}`} x={cx} y={height - 9} textAnchor="middle">
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
            <line className="trend-baseline" x1={pad.left} x2={w - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} />
          </svg>
        )}
        {h && hover !== null && (
          <div
            className="trend-tip"
            style={{
              left: Math.min(Math.max(pad.left + band * hover + band / 2, 90), w - 90),
              top: Math.max(0, y(Math.max(h.received, h.responded)) - 12),
            }}
            aria-hidden="true"
          >
            <strong>
              {h.label} {h.month.slice(0, 4)}
            </strong>
            <span>
              <i className="dot" /> {formatNumber(h.received)} reçues
            </span>
            <span>
              <i className="dot red" /> {formatNumber(h.responded)} réponses
            </span>
          </div>
        )}
      </div>
      <figcaption className="chart-summary">
        <span className="sr-only">{caption}. </span>
        {summary}
      </figcaption>
      {data.length > 0 && (
        <details className="data-table">
          <summary>Afficher les données du graphique</summary>
          <div className="tablewrap">
            <table className="table" style={{ minWidth: 0 }}>
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr>
                  <th scope="col">Mois</th>
                  <th scope="col" className="num">
                    Reçues
                  </th>
                  <th scope="col" className="num">
                    Réponses
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.month}>
                    <th scope="row" className="row-head">
                      {d.label} {d.month.slice(0, 4)}
                    </th>
                    <td className="num">{formatNumber(d.received)}</td>
                    <td className="num">{formatNumber(d.responded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}

// 8 teintes distinctes de la charte (au-delà, la légende textuelle reste la référence).
const DONUT_COLORS = ['var(--blue)', 'var(--red)', 'var(--navy)', '#6b9dcc', 'var(--warn)', '#8a9bb0', 'var(--success)', '#e58a96'];

/** Anneau de répartition + légende textuelle (valeurs et pourcentages lisibles sans la couleur). */
export function DonutChart({
  data,
  label,
  unit = 'réclamations',
  dominantLabel = 'Canal principal',
}: {
  data: { label: string; count: number }[];
  label: string;
  unit?: string;
  /** Libellé de la part dominante dans le résumé textuel (ex. « Rôle le plus représenté »). */
  dominantLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  // Longueur et décalage de chaque segment, calculés à l'avance (rendu pur).
  const segments = data.map((d, i) => {
    const len = total ? (d.count / total) * c : 0;
    const start = data.slice(0, i).reduce((sum, p) => sum + (total ? (p.count / total) * c : 0), 0);
    return { ...d, len, start };
  });
  const top = [...data].sort((a, b) => b.count - a.count)[0];
  return (
    <figure className="donut" style={{ margin: 0 }}>
      <div className="donut-body">
        <svg
          viewBox="0 0 140 140"
          width="140"
          height="140"
          role="img"
          aria-label={`${label} : ${data.map((d) => `${d.label} ${d.count}`).join(', ')}`}
        >
          <circle cx="70" cy="70" r={r} className="donut-track" />
          {segments.map((d, i) => (
            <circle
              key={d.label}
              cx="70"
              cy="70"
              r={r}
              className="donut-seg"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeDasharray={`${Math.max(0, d.len - 2)} ${c}`}
              strokeDashoffset={-d.start}
              style={{ animationDelay: `${i * 90}ms` }}
            />
          ))}
          <text x="70" y="66" textAnchor="middle" className="donut-total">
            {formatNumber(total)}
          </text>
          <text x="70" y="84" textAnchor="middle" className="donut-caption">
            {unit}
          </text>
        </svg>
        <ul className="donut-legend" aria-label={label}>
          {data.map((d, i) => (
            <li key={d.label}>
              <i style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} aria-hidden="true" />
              <span>{d.label}</span>
              <b>{formatNumber(d.count)}</b>
              <em>{total ? Math.round((d.count / total) * 100) : 0} %</em>
            </li>
          ))}
        </ul>
      </div>
      {top && total > 0 && (
        <figcaption className="chart-summary">
          {dominantLabel} : {top.label} ({formatNumber(top.count)} sur {formatNumber(total)}, soit {Math.round((top.count / total) * 100)}{' '}
          %).
        </figcaption>
      )}
    </figure>
  );
}

/** Jauge circulaire d'un pourcentage (valeur null = non calculable, affichée « — »). */
export function RingGauge({ value, label, sub }: { value: number | null | undefined; label: string; sub?: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const pct = value === null || value === undefined ? null : Math.max(0, Math.min(100, value));
  return (
    <div className="ring" role="img" aria-label={`${label} : ${pct === null ? 'non calculable' : `${formatNumber(pct)} %`}`}>
      <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
        <circle cx="48" cy="48" r={r} className="ring-track" />
        <circle cx="48" cy="48" r={r} className="ring-value" strokeDasharray={`${pct === null ? 0 : (pct / 100) * c} ${c}`} />
      </svg>
      <div className="ring-text" aria-hidden="true">
        <strong>{pct === null ? '—' : `${String(pct).replace('.', ',')} %`}</strong>
      </div>
      <div className="ring-label" aria-hidden="true">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

/** Activité quotidienne (une série) : barres, axe gradué, survol, résumé textuel. */
export function ActivityChart({
  data,
  caption,
  unit = 'événements',
  height = 240,
}: {
  data: { date: string; label: string; count: number }[];
  caption: string;
  unit?: string;
  height?: number;
}) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.count)));
  const pad = { top: 14, right: 6, bottom: 28, left: 36 };
  const w = Math.max(width, 260);
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const band = data.length ? innerW / data.length : innerW;
  const barW = Math.max(5, Math.min(24, band * 0.55));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = axisTicks(max);
  const labelEvery = band < 30 ? Math.ceil(30 / band) : 1;
  const total = data.reduce((s, d) => s + d.count, 0);
  const peak = data.reduce<(typeof data)[number] | null>((p, d) => (!p || d.count > p.count ? d : p), null);
  const summary = data.length
    ? `${formatNumber(total)} ${unit} sur ${data.length} jours${peak && peak.count ? `, pic le ${peak.label} (${formatNumber(peak.count)})` : ''}.`
    : 'Aucune donnée.';
  const h = hover !== null ? data[hover] : null;

  return (
    <figure style={{ margin: 0 }}>
      <div className="trend-canvas" ref={wrapRef} style={{ minHeight: height }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={w} height={height} role="img" aria-label={`${caption}. ${summary}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="trend-grid" x1={pad.left} x2={w - pad.right} y1={y(t)} y2={y(t)} />
                <text className="trend-axis" x={pad.left - 8} y={y(t) + 4} textAnchor="end">
                  {formatNumber(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.left + band * i + band / 2;
              const active = hover === i;
              return (
                <g key={d.date} className={`trend-col${active ? ' active' : ''}`} onMouseEnter={() => setHover(i)}>
                  <rect className="trend-band" x={pad.left + band * i + 1} y={pad.top} width={band - 2} height={innerH} rx={6} />
                  <rect
                    className="trend-bar activity"
                    x={cx - barW / 2}
                    y={y(d.count)}
                    width={barW}
                    height={Math.max(0, pad.top + innerH - y(d.count))}
                    rx={Math.min(5, barW / 2)}
                    style={{ animationDelay: `${i * 30}ms` }}
                  />
                  {i % labelEvery === 0 && (
                    <text className={`trend-axis month${active ? ' active' : ''}`} x={cx} y={height - 8} textAnchor="middle">
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
            <line className="trend-baseline" x1={pad.left} x2={w - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} />
          </svg>
        )}
        {h && hover !== null && (
          <div
            className="trend-tip"
            style={{ left: Math.min(Math.max(pad.left + band * hover + band / 2, 70), w - 70), top: Math.max(0, y(h.count) - 10) }}
            aria-hidden="true"
          >
            <strong>{h.label}</strong>
            <span>
              {formatNumber(h.count)} {unit}
            </span>
          </div>
        )}
      </div>
      <figcaption className="chart-summary">
        <span className="sr-only">{caption}. </span>
        {summary}
      </figcaption>
    </figure>
  );
}
