import { History } from 'lucide-react';
import { actorName, formatDateTime, itemDate } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AuditEntry } from '@/types/api';

function display(v: unknown): string {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Différences avant/après, rendues en texte brut (aucune injection HTML). */
export function AuditDiff({ before, after }: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null }) {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  if (keys.length === 0) return null;
  const lines = keys
    .filter((k) => display(before?.[k]) !== display(after?.[k]))
    .map((k) => `${k} : ${display(before?.[k])} → ${display(after?.[k])}`);
  if (lines.length === 0) return null;
  return <pre className="diff">{lines.join('\n')}</pre>;
}

export function AuditTab({ audit }: { audit: AuditEntry[] }) {
  if (audit.length === 0) return <EmptyState icon={History} title="Aucune entrée d'audit" />;
  return (
    <div>
      <p className="caption" style={{ marginTop: 0 }}>
        50 dernières entrées · journal en ajout seul, jamais modifié ni supprimé. Les consultations du dossier sont aussi journalisées.
      </p>
      <div className="tablewrap">
        <table className="table stack-sm">
          <caption className="sr-only">Journal d'audit du dossier</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Utilisateur</th>
              <th scope="col">Action</th>
              <th scope="col">Détail</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}>
                <td className="nowrap" data-label="Date">{formatDateTime(itemDate(a))}</td>
                <td data-label="Utilisateur">{actorName(a.user, 'Système')}</td>
                <td data-label="Action">
                  <code>{a.action}</code>
                </td>
                <td data-label="Détail">
                  {a.reason && <div>Motif : {a.reason}</div>}
                  <AuditDiff before={a.before} after={a.after} />
                  {a.ip && <span className="cell-sub">IP {a.ip}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
