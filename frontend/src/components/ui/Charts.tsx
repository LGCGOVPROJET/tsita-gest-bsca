import { formatNumber } from '@/lib/format';

interface MonthlyPoint {
  month: string;
  label: string;
  received: number;
  responded: number;
}

/** Histogramme mensuel reçues / réponses (fidèle à la maquette) avec résumé textuel et données tabulaires. */
export function MonthlyChart({ data, caption }: { data: MonthlyPoint[]; caption: string }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.received, d.responded]));
  const totalR = data.reduce((s, d) => s + d.received, 0);
  const totalS = data.reduce((s, d) => s + d.responded, 0);
  const peak = data.reduce<MonthlyPoint | null>((p, d) => (!p || d.received > p.received ? d : p), null);
  const summary =
    data.length === 0
      ? 'Aucune donnée mensuelle pour cette sélection.'
      : `Sur ${data.length} mois, ${formatNumber(totalR)} réclamations reçues et ${formatNumber(totalS)} réponses envoyées.` +
        (peak ? ` Pic de réception en ${peak.label} (${formatNumber(peak.received)}).` : '');

  return (
    <figure style={{ margin: 0 }}>
      <div className="chart" aria-hidden="true">
        {data.map((d) => (
          <div className="col" key={d.month}>
            <div className="bar" style={{ height: `${(d.received / max) * 100}%` }} />
            <div className="bar red" style={{ height: `${(d.responded / max) * 100}%` }} />
            <span className="col-tip">
              {d.label} : {formatNumber(d.received)} reçues · {formatNumber(d.responded)} réponses
            </span>
            <span className="col-label">{d.label}</span>
          </div>
        ))}
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
                  <th scope="col" className="num">Reçues</th>
                  <th scope="col" className="num">Réponses</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.month}>
                    <th scope="row" style={{ textTransform: 'none', letterSpacing: 0, background: 'none', fontSize: 'var(--fs-sm)', color: 'var(--ink)' }}>
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

/** Barres horizontales (nature des demandes, canaux) avec résumé textuel. */
export function RowBars({ data, label, unit = 'réclamations', dominantLabel = 'Motif dominant' }: { data: { label: string; count: number }[]; label: string; unit?: string; dominantLabel?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const top = data[0];
  return (
    <figure style={{ margin: 0 }}>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label={label}>
        {data.map((d, i) => (
          <li className="rowbar" key={d.label}>
            <span>{d.label}</span>
            <span className="track" aria-hidden="true">
              <span className={`fill ${i === 1 ? 'red' : ''}`} style={{ width: `${(d.count / max) * 100}%`, display: 'block' }} />
            </span>
            <b>
              {formatNumber(d.count)}
              <span className="sr-only"> {unit}</span>
            </b>
          </li>
        ))}
      </ul>
      {data.length > 0 && (
        <figcaption className="chart-summary">
          {top ? `${dominantLabel} : ${top.label} (${formatNumber(top.count)} sur ${formatNumber(total)}, soit ${Math.round((top.count / Math.max(total, 1)) * 100)} %).` : ''}
        </figcaption>
      )}
    </figure>
  );
}
