import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useReferentials } from '@/hooks/useReferentials';
import { useDebounce } from '@/hooks/useDebounce';
import { actorName, formatDateTime, itemDate } from '@/lib/format';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { AuditDiff } from '@/features/complaint/AuditTab';

export function AuditLogSection() {
  const ref = useReferentials();
  const [f, setF] = useState({ user_id: '', action: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const action = useDebounce(f.action, 300);
  const params = { user_id: f.user_id || undefined, action: action || undefined, from: f.from || undefined, to: f.to || undefined, page: String(page) };
  const q = useQuery({ queryKey: ['admin', 'audit', params], queryFn: () => adminApi.auditLogs(params), placeholderData: keepPreviousData });
  const upd = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF((s) => ({ ...s, [k]: e.target.value }));
    setPage(1);
  };

  return (
    <section aria-label="Journal d'audit">
      <div className="card-head">
        <div>
          <h2>Journal d'audit</h2>
          <span className="caption">Journal en ajout seul : connexions, consultations, modifications, exports, validations.</span>
        </div>
      </div>
      <form className="filters" role="search" aria-label="Filtres du journal" onSubmit={(e) => e.preventDefault()}>
        <label className="field">
          <span className="label-text">Utilisateur</span>
          <select value={f.user_id} onChange={upd('user_id')}>
            <option value="">Tous</option>
            {(ref.data?.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label-text">Action</span>
          <input type="search" placeholder="ex. complaint.viewed" value={f.action} onChange={upd('action')} />
        </label>
        <label className="field">
          <span className="label-text">Du</span>
          <input type="date" value={f.from} onChange={upd('from')} />
        </label>
        <label className="field">
          <span className="label-text">Au</span>
          <input type="date" value={f.to} onChange={upd('to')} />
        </label>
      </form>
      {q.isPending ? (
        <SkeletonRows rows={8} cols={4} />
      ) : q.isError ? (
        <ErrorState message={toApiError(q.error).message} onRetry={() => q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="Aucune entrée" description="Aucune entrée ne correspond à ces filtres." />
      ) : (
        <>
          <ResponsiveTable
            caption="Journal d'audit"
            rows={q.data.data}
            rowKey={(a) => a.id}
            mobileTitle={(a) => a.action}
            columns={[
              { key: 'date', header: 'Date', render: (a) => <span className="nowrap">{formatDateTime(itemDate(a))}</span> },
              { key: 'user', header: 'Utilisateur', render: (a) => actorName(a.user, 'Système') },
              { key: 'action', header: 'Action', render: (a) => <code>{a.action}</code> },
              { key: 'object', header: 'Objet', render: (a) => (a.auditable_type ? `${a.auditable_type.split('\\').pop()} #${a.auditable_id ?? ''}` : '—') },
              {
                key: 'detail',
                header: 'Détail',
                render: (a) => (
                  <>
                    {a.reason && <div>Motif : {a.reason}</div>}
                    <AuditDiff before={a.before} after={a.after} />
                    {a.ip && <span className="cell-sub">IP {a.ip}</span>}
                  </>
                ),
              },
            ]}
          />
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      )}
    </section>
  );
}
