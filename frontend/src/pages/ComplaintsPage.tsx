import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, FileSearch, Plus } from 'lucide-react';
import { complaintsApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDate, formatNumber } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterBar, type FilterKey } from '@/features/filters/FilterBar';
import { ResponsiveTable, type Column } from '@/components/ui/ResponsiveTable';
import { Pagination } from '@/components/ui/Pagination';
import { DeadlineBadge, PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast-context';
import type { ComplaintListItem, ExportFormat } from '@/types/api';

const KEYS = [
  'search',
  'status',
  'agency_id',
  'entity_id',
  'category_id',
  'channel',
  'deadline_flag',
  'from',
  'to',
  'mine',
  'sort',
  'page',
  'per_page',
] as const;

const FIELDS: FilterKey[] = ['search', 'status', 'agency_id', 'entity_id', 'category_id', 'channel', 'deadline_flag', 'from', 'to', 'mine'];

export default function ComplaintsPage() {
  useDocumentTitle('Réclamations');
  const { user } = useAuth();
  const toast = useToast();
  const { values, set, setMany, reset, activeCount } = useUrlFilters(KEYS, { sort: '-received_at', per_page: '25' });
  const [search, setSearch] = useState(values.search);
  const debouncedSearch = useDebounce(search, 350);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  useEffect(() => {
    if (debouncedSearch !== values.search) set('search', debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const q = useQuery({
    queryKey: ['complaints', values],
    queryFn: () => complaintsApi.list(values),
    placeholderData: keepPreviousData,
  });

  const doExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await complaintsApi.exportFile(values, format);
      toast.success(`Export ${format.toUpperCase()} généré avec les filtres actifs. Il est journalisé.`);
    } catch (e) {
      toast.error(toApiError(e).message);
    } finally {
      setExporting(null);
    }
  };

  const columns: Column<ComplaintListItem>[] = [
    {
      key: 'reference',
      header: 'Référence',
      sortKey: 'reference',
      hideOnMobile: true,
      render: (c) => (
        <Link className="ref-link" to={`/app/reclamations/${c.id}`}>
          {c.reference}
        </Link>
      ),
    },
    {
      key: 'subject',
      header: 'Objet',
      className: 'col-subject',
      render: (c) => (
        <>
          {c.subject}
          <span className="cell-sub">
            {c.customer_name}
            {c.category ? ` · ${c.category.label}` : ''}
          </span>
        </>
      ),
    },
    { key: 'channel', header: 'Canal', render: (c) => c.channel?.label ?? '—' },
    { key: 'agency', header: 'Agence de réception', render: (c) => c.receiving_agency?.name ?? <span className="muted">Non applicable</span> },
    { key: 'entity', header: 'Fonction', render: (c) => c.processing_entity?.name ?? <span className="muted">À affecter</span> },
    { key: 'received_at', header: 'Réception', sortKey: 'received_at', render: (c) => <span className="nowrap">{formatDate(c.received_at)}</span> },
    {
      key: 'due_at',
      header: 'Échéance',
      sortKey: 'due_at',
      render: (c) => (
        <span className="badge-row">
          <span className="nowrap">{formatDate(c.due_at)}</span>
          <DeadlineBadge flag={c.deadline_flag} label={c.deadline_flag_label} />
        </span>
      ),
    },
    { key: 'priority', header: 'Priorité', sortKey: 'priority', render: (c) => <PriorityBadge priority={c.priority} /> },
    { key: 'status', header: 'État', sortKey: 'status', hideOnMobile: true, render: (c) => <StatusBadge status={c.status} label={c.status_label} /> },
  ];

  const total = q.data?.meta.total;

  return (
    <>
      <PageHeader
        eyebrow="Traitement opérationnel"
        title="Toutes les réclamations"
        sub="Une file de travail commune aux agences, gestionnaires et responsables."
        actions={
          <>
            {can(user, 'complaints.export') && (
              <div className="row" role="group" aria-label="Exporter la sélection">
                {(['csv', 'xlsx', 'pdf'] as ExportFormat[]).map((f) => (
                  <Button
                    key={f}
                    variant="alt"
                    size="sm"
                    loading={exporting === f}
                    disabled={exporting !== null}
                    onClick={() => doExport(f)}
                    icon={<Download size={14} aria-hidden="true" />}
                    aria-label={`Exporter la sélection au format ${f.toUpperCase()}`}
                  >
                    {f.toUpperCase()}
                  </Button>
                ))}
              </div>
            )}
            {can(user, 'complaints.create') && (
              <Link className="btn" to="/app/reclamations/nouvelle">
                <Plus size={16} aria-hidden="true" /> Enregistrer un dossier
              </Link>
            )}
          </>
        }
      />

      <FilterBar
        label="Filtres des réclamations"
        fields={FIELDS}
        values={values}
        searchValue={search}
        onSearchChange={setSearch}
        onChange={(k, v) => set(k as (typeof KEYS)[number], v)}
        onReset={
          activeCount
            ? () => {
                setSearch('');
                reset();
              }
            : undefined
        }
        note={
          total !== undefined
            ? `${formatNumber(total)} dossier${total > 1 ? 's' : ''} dans cette sélection${activeCount ? ` · ${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}` : ''}.`
            : 'Chargement…'
        }
      />

      <section className="card" aria-label="Liste des réclamations" aria-busy={q.isFetching || undefined}>
        {q.isPending ? (
          <SkeletonRows rows={8} cols={7} />
        ) : q.isError ? (
          <ErrorState message={toApiError(q.error).message} onRetry={() => q.refetch()} />
        ) : q.data.data.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="Aucun dossier pour ces filtres"
            description="Élargissez la période, retirez un filtre ou vérifiez l'orthographe de la référence."
            action={
              activeCount ? (
                <Button
                  variant="alt"
                  onClick={() => {
                    setSearch('');
                    reset();
                  }}
                >
                  Effacer les filtres
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div style={{ opacity: q.isPlaceholderData ? 0.6 : 1, transition: 'opacity 180ms' }}>
            <ResponsiveTable
              caption="Réclamations"
              columns={columns}
              rows={q.data.data}
              rowKey={(c) => c.id}
              sort={values.sort}
              onSort={(s) => set('sort', s)}
              mobileTitle={(c) => (
                <Link className="ref-link" to={`/app/reclamations/${c.id}`}>
                  {c.reference}
                </Link>
              )}
              mobileBadge={(c) => <StatusBadge status={c.status} label={c.status_label} />}
            />
            <Pagination
              meta={q.data.meta}
              onPage={(p) => setMany({ page: String(p) }, { resetPage: false })}
              onPerPage={(n) => setMany({ per_page: String(n) })}
              label="Pagination des réclamations"
            />
          </div>
        )}
      </section>
    </>
  );
}
