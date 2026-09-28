import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, CheckCircle2, History } from 'lucide-react';
import { deadlinesApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDate, formatNumber } from '@/lib/format';
import { RULE_KIND_LABELS, RULE_SOURCE_LABELS, RULE_UNIT_LABELS } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { tabPanelProps } from '@/components/ui/tabPanel';
import { FilterBar } from '@/features/filters/FilterBar';
import { ResponsiveTable, type Column } from '@/components/ui/ResponsiveTable';
import { Pagination } from '@/components/ui/Pagination';
import { DeadlineBadge, RuleStatusBadge, StatusBadge } from '@/components/ui/Badge';
import { Stat, StatList } from '@/components/ui/Stat';
import { InfoBox } from '@/components/ui/InfoBox';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import type { ComplaintListItem, DeadlineRule } from '@/types/api';

type Queue = 'a_echeance' | 'en_retard' | 'clos_en_retard';
const KEYS = ['queue', 'agency_id', 'entity_id', 'category_id', 'sort', 'page'] as const;

const QUEUE_HELP: Record<Queue, string> = {
  a_echeance: 'Dossiers ouverts, pas encore en retard, classés par échéance la plus proche.',
  en_retard: 'Dossiers toujours ouverts après leur échéance de réponse finale : escalade et justification attendues.',
  clos_en_retard: 'Dossiers répondus après l’échéance : conservés pour le contrôle et le reporting.',
};

export default function DeadlinesPage() {
  useDocumentTitle('Délais et alertes');
  const { values, set, setMany } = useUrlFilters(KEYS, { queue: 'a_echeance', sort: 'due_at' });
  const queue = values.queue as Queue;

  const q = useQuery({
    queryKey: ['deadlines', values],
    queryFn: () => deadlinesApi.list(values),
    placeholderData: keepPreviousData,
  });
  const summary = q.data?.summary;
  const rules: DeadlineRule[] = q.data?.rules ?? [];
  const demo = q.data?.rule_is_demo ?? rules.some((r) => r.is_demo ?? (r.source_type === 'demonstration' || r.status !== 'valide'));

  const columns: Column<ComplaintListItem>[] = [
    { key: 'ref', header: 'Référence', sortKey: 'reference', hideOnMobile: true, render: (c) => <Link className="ref-link" to={`/app/reclamations/${c.id}`}>{c.reference}</Link> },
    { key: 'subject', header: 'Objet', render: (c) => <>{c.subject}<span className="cell-sub">{c.customer_name}</span></> },
    { key: 'owner', header: 'Propriétaire', render: (c) => c.owner?.name ?? <span className="muted">Non affecté</span> },
    { key: 'entity', header: 'Fonction', render: (c) => c.processing_entity?.name ?? '—' },
    { key: 'due', header: 'Échéance', sortKey: 'due_at', render: (c) => <span className="nowrap">{formatDate(c.due_at)}</span> },
    { key: 'flag', header: 'Signal', render: (c) => <DeadlineBadge flag={c.deadline_flag} label={c.deadline_flag_label} /> },
    { key: 'status', header: 'État', hideOnMobile: true, render: (c) => <StatusBadge status={c.status} label={c.status_label} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Supervision"
        title="Délais et alertes"
        sub="Des échéances traçables, fondées sur les règles approuvées par BSCA."
        actions={
          <Link className="btn alt" to="/app/reclamations">
            Ouvrir la file de travail
          </Link>
        }
      />

      {demo && (
        <InfoBox tone="warn" role="note">
          <strong>Règle de démonstration — non validée par la conformité BSCA.</strong> Les signaux ci-dessous sont calculés à titre indicatif.
        </InfoBox>
      )}

      <section className="cols3" aria-label="Compteurs">
        <KpiCard label="En retard" value={summary?.en_retard} icon={AlertOctagon} tone="danger" loading={q.isPending} foot={`Ouverts après échéance · au ${formatDate(new Date())}`} definition="Dossiers ouverts à la date de calcul dont l'échéance de réponse finale (initiale) est dépassée." />
        <KpiCard label="À risque" value={summary?.a_risque} icon={AlertTriangle} tone="amber" loading={q.isPending} foot={`Pré-alerte atteinte · au ${formatDate(new Date())}`} definition="Dossiers ouverts, pas encore en retard, dont la pré-alerte interne est atteinte." />
        <KpiCard label="Clos en retard" value={summary?.clos_en_retard} icon={History} loading={q.isPending} foot="Réponse envoyée après échéance" definition="Dossiers dont la réponse finale est partie après l'échéance initiale." />
      </section>

      <section className="card spacing" aria-label="Files d'échéance">
        <Tabs<Queue>
          label="Files d'échéance"
          idPrefix="dl"
          active={queue}
          onChange={(k) => setMany({ queue: k })}
          tabs={[
            { key: 'a_echeance', label: 'À échéance', count: summary?.a_echeance ?? (queue === 'a_echeance' ? q.data?.meta.total : undefined) },
            { key: 'en_retard', label: 'En retard', count: summary?.en_retard },
            { key: 'clos_en_retard', label: 'Clos en retard', count: summary?.clos_en_retard },
          ]}
        />
        <div {...tabPanelProps('dl', queue)}>
          <p className="caption" style={{ marginTop: 0 }}>{QUEUE_HELP[queue]}</p>
          <FilterBar fields={['agency_id', 'entity_id', 'category_id']} values={values} onChange={(k, v) => set(k as (typeof KEYS)[number], v)} label="Filtres des échéances" />
          {q.isPending ? (
            <SkeletonRows rows={6} cols={6} />
          ) : q.isError ? (
            <ErrorState message={toApiError(q.error).message} onRetry={() => q.refetch()} />
          ) : q.data.data.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="File vide" description="Aucun dossier dans cette file pour votre périmètre." />
          ) : (
            <>
              <ResponsiveTable
                caption={`File « ${queue === 'a_echeance' ? 'À échéance' : queue === 'en_retard' ? 'En retard' : 'Clos en retard'} »`}
                columns={columns}
                rows={q.data.data}
                rowKey={(c) => c.id}
                sort={values.sort}
                onSort={(s) => set('sort', s)}
                mobileTitle={(c) => <Link className="ref-link" to={`/app/reclamations/${c.id}`}>{c.reference}</Link>}
                mobileBadge={(c) => <StatusBadge status={c.status} label={c.status_label} />}
              />
              <Pagination meta={q.data.meta} onPage={(p) => setMany({ page: String(p) }, { resetPage: false })} />
            </>
          )}
        </div>
      </section>

      <div className="grid equal">
        <Card title="Logique de suivi">
          <StatList>
            <Stat label="Point de départ">Réception vérifiée (jour de réception non compté)</Stat>
            <Stat label="Unité de calcul">Calendaires ou ouvrés selon règle</Stat>
            <Stat label="Jours ouvrés">Lundi–vendredi hors jours fériés du Congo</Stat>
            <Stat label="Fuseau">Africa/Brazzaville</Stat>
            <Stat label="Fin d'échéance">23:59:59 heure locale du jour cible</Stat>
            <Stat label="Attente d'information">Pas de suspension du délai</Stat>
            <Stat label="Échéance initiale">Conservée dans l'audit</Stat>
          </StatList>
          <InfoBox tone="warn">Aucun seuil chiffré provenant d'une autre banque n'est appliqué comme engagement BSCA sans validation de la conformité.</InfoBox>
        </Card>
        <Card title="Règles actives" caption="Versionnées ; seules les règles validées s'appliquent en production">
          {rules.length === 0 ? (
            <p className="caption">{q.isPending ? 'Chargement…' : 'Aucune règle active communiquée.'}</p>
          ) : (
            <div className="tablewrap">
              <table className="table stack-sm" style={{ minWidth: 520 }}>
                <caption className="sr-only">Règles de délai actives</caption>
                <thead>
                  <tr>
                    <th scope="col">Règle</th>
                    <th scope="col">Durée</th>
                    <th scope="col">Source</th>
                    <th scope="col">Version</th>
                    <th scope="col">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Règle">
                        {r.label}
                        <span className="cell-sub">{RULE_KIND_LABELS[r.kind] ?? r.kind}</span>
                      </td>
                      <td className="nowrap" data-label="Durée">
                        {formatNumber(r.duration)} {r.unit === 'business' ? 'j. ouvrés' : 'j. calendaires'}
                        <span className="cell-sub">{RULE_UNIT_LABELS[r.unit]}</span>
                      </td>
                      <td data-label="Source">
                        {RULE_SOURCE_LABELS[r.source_type] ?? r.source_type}
                        {r.source_reference && <span className="cell-sub">{r.source_reference}</span>}
                      </td>
                      <td data-label="Version">
                        v{r.version}
                        <span className="cell-sub">depuis le {formatDate(r.effective_from)}</span>
                      </td>
                      <td data-label="Validation">
                        <RuleStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
