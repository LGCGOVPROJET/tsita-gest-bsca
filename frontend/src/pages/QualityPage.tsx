import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ShieldCheck } from 'lucide-react';
import { qualityApi, type QualityActionPayload } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useReferentials } from '@/hooks/useReferentials';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDate, formatNumber, monthStart, todayLocal } from '@/lib/format';
import { QUALITY_STATUS_LABELS, toOptions } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { FilterBar } from '@/features/filters/FilterBar';
import { ResponsiveTable, type Column } from '@/components/ui/ResponsiveTable';
import { Pagination } from '@/components/ui/Pagination';
import { QualityStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { InfoBox } from '@/components/ui/InfoBox';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import type { QualityAction, RecurringGroup } from '@/types/api';

const KEYS = ['from', 'to', 'agency_id', 'entity_id', 'page'] as const;

function lbl(v: RecurringGroup['category']): string {
  if (!v) return 'Non qualifiée';
  return typeof v === 'string' ? v : v.label;
}

export default function QualityPage() {
  useDocumentTitle('Qualité et actions');
  const { user } = useAuth();
  const today = todayLocal();
  const defaults = useMemo(() => ({ from: monthStart(today, 11), to: today }), [today]);
  const { values, set, setMany } = useUrlFilters(KEYS, defaults);
  const [editing, setEditing] = useState<QualityAction | 'new' | null>(null);
  const canManage = can(user, 'quality.manage');

  const recurring = useQuery({
    queryKey: ['quality-recurring', values.from, values.to, values.agency_id, values.entity_id],
    queryFn: () => qualityApi.recurring({ from: values.from, to: values.to, agency_id: values.agency_id, entity_id: values.entity_id }),
    placeholderData: keepPreviousData,
  });
  const actions = useQuery({
    queryKey: ['quality-actions', values.page],
    queryFn: () => qualityApi.actions({ page: values.page }),
    placeholderData: keepPreviousData,
  });

  const maxCount = Math.max(1, ...(recurring.data ?? []).map((r) => r.count));

  const columns: Column<QualityAction>[] = [
    { key: 'cause', header: 'Cause à confirmer', render: (a) => <>{a.root_cause}{a.category && <span className="cell-sub">{a.category.label}</span>}</> },
    { key: 'action', header: 'Action', render: (a) => <>{a.title}{a.complaints_count ? <span className="cell-sub">{a.complaints_count} dossier(s) liés</span> : null}</> },
    { key: 'owner', header: 'Propriétaire', render: (a) => a.owner?.name ?? a.owner_entity?.name ?? <span className="muted">À désigner</span> },
    { key: 'due', header: 'Échéance', render: (a) => <span className="nowrap">{formatDate(a.due_at)}</span> },
    { key: 'status', header: 'État', render: (a) => <QualityStatusBadge status={a.status} /> },
    { key: 'eff', header: "Mesure d'efficacité", render: (a) => a.effectiveness_measure || <span className="muted">À définir</span> },
    { key: 'evidence', header: 'Preuve', render: (a) => a.evidence || <span className="muted">—</span> },
    ...(canManage
      ? [
          {
            key: 'edit',
            header: 'Modifier',
            render: (a: QualityAction) => (
              <Button size="sm" variant="alt" icon={<Pencil size={14} aria-hidden="true" />} onClick={() => setEditing(a)} aria-label={`Modifier l'action « ${a.title} »`}>
                Modifier
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Amélioration continue"
        title="Qualité et actions correctives"
        sub="Identifier les causes récurrentes et vérifier l'effet des solutions."
        actions={
          canManage && (
            <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setEditing('new')}>
              Ajouter une action
            </Button>
          )
        }
      />
      <section className="cols3" aria-label="Démarche">
        <Card as="article">
          <div className="stepnum">CAUSE</div>
          <h2>Regrouper les signaux</h2>
          <p style={{ margin: 0 }}>Relier les réclamations de même nature sans confondre motif déclaré et cause confirmée.</p>
        </Card>
        <Card as="article">
          <div className="stepnum">ACTION</div>
          <h2>Attribuer et corriger</h2>
          <p style={{ margin: 0 }}>Nommer un responsable, fixer une échéance et joindre la preuve de réalisation.</p>
        </Card>
        <Card as="article">
          <div className="stepnum">CONTRÔLE</div>
          <h2>Mesurer l'impact</h2>
          <p style={{ margin: 0 }}>Comparer volumes, délais et réouvertures avant et après la mesure sur un périmètre constant.</p>
        </Card>
      </section>

      <section className="card spacing" aria-label="Réclamations récurrentes">
        <div className="card-head">
          <div>
            <h2>Réclamations récurrentes</h2>
            <span className="caption">Regroupements par catégorie et produit · du {formatDate(values.from)} au {formatDate(values.to)}</span>
          </div>
        </div>
        <FilterBar fields={['from', 'to', 'agency_id', 'entity_id']} values={values} onChange={(k, v) => set(k as (typeof KEYS)[number], v)} label="Filtres des récurrences" />
        {recurring.isPending ? (
          <SkeletonRows rows={5} cols={5} />
        ) : recurring.isError ? (
          <ErrorState message={toApiError(recurring.error).message} onRetry={() => recurring.refetch()} />
        ) : recurring.data.length === 0 ? (
          <EmptyState title="Aucun regroupement" description="Pas de réclamations récurrentes sur cette période." />
        ) : (
          <ResponsiveTable
            caption="Réclamations récurrentes par catégorie et produit"
            rows={[...recurring.data].sort((a, b) => b.count - a.count)}
            rowKey={(r) => `${lbl(r.category)}-${lbl(r.product)}`}
            mobileTitle={(r) => lbl(r.category)}
            columns={[
              { key: 'cat', header: 'Catégorie', hideOnMobile: true, render: (r) => <strong>{lbl(r.category)}</strong> },
              { key: 'prod', header: 'Produit', render: (r) => lbl(r.product) },
              {
                key: 'count',
                header: 'Volume',
                render: (r) => (
                  <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <span className="track" style={{ width: 90, display: 'inline-block' }} aria-hidden="true">
                      <span className="fill" style={{ width: `${(r.count / maxCount) * 100}%`, display: 'block' }} />
                    </span>
                    <b>{formatNumber(r.count)}</b>
                  </span>
                ),
              },
              { key: 'late', header: 'En retard', render: (r) => <span style={{ color: r.late_count ? 'var(--danger)' : undefined, fontWeight: 700 }}>{formatNumber(r.late_count)}</span> },
              { key: 'reopen', header: 'Réouvertes', render: (r) => formatNumber(r.reopened_count) },
            ]}
          />
        )}
      </section>

      <section className="card spacing" aria-label="Plan d'actions">
        <h2>Plan d'actions</h2>
        {actions.isPending ? (
          <SkeletonRows rows={4} cols={6} />
        ) : actions.isError ? (
          <ErrorState message={toApiError(actions.error).message} onRetry={() => actions.refetch()} />
        ) : actions.data.data.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Aucune action corrective"
            description="Créez une action à partir d'une cause récurrente."
            action={canManage ? <Button onClick={() => setEditing('new')}>Ajouter une action</Button> : undefined}
          />
        ) : (
          <>
            <ResponsiveTable caption="Plan d'actions correctives" columns={columns} rows={actions.data.data} rowKey={(a) => a.id} mobileTitle={(a) => a.title} />
            <Pagination meta={actions.data.meta} onPage={(p) => setMany({ page: String(p) }, { resetPage: false })} />
          </>
        )}
      </section>

      {editing && <ActionForm action={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ActionForm({ action, onClose }: { action: QualityAction | null; onClose: () => void }) {
  const ref = useReferentials();
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({
    title: action?.title ?? '',
    root_cause: action?.root_cause ?? '',
    category_id: action?.category_id ?? action?.category?.id ?? '',
    owner_id: action?.owner_id ?? action?.owner?.id ?? '',
    owner_entity_id: action?.owner_entity_id ?? action?.owner_entity?.id ?? '',
    due_at: action?.due_at?.slice(0, 10) ?? '',
    status: action?.status ?? 'planifiee',
    effectiveness_measure: action?.effectiveness_measure ?? '',
    evidence: action?.evidence ?? '',
  });
  const [local, setLocal] = useState<Record<string, string>>({});
  const upd = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: (p: QualityActionPayload) => (action ? qualityApi.updateAction(action.id, p) : qualityApi.createAction(p)),
    onSuccess: async () => {
      toast.success(action ? 'Action mise à jour.' : 'Action corrective créée.');
      await qc.invalidateQueries({ queryKey: ['quality-actions'] });
      onClose();
    },
  });
  const err = m.isError ? toApiError(m.error) : null;
  const fe = { ...local, ...(err?.fieldErrors ?? {}) };

  return (
    <Modal open onClose={onClose} wide title={action ? "Modifier l'action corrective" : 'Nouvelle action corrective'}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const errs: Record<string, string> = {};
          if (v.title.trim().length < 3) errs.title = "Intitulé de l'action requis.";
          if (v.root_cause.trim().length < 3) errs.root_cause = 'Décrivez la cause.';
          if ((v.status === 'realisee' || v.status === 'verifiee') && !v.evidence.trim()) errs.evidence = 'Une preuve de réalisation est requise.';
          if (v.status === 'verifiee' && !v.effectiveness_measure.trim()) errs.effectiveness_measure = "Indiquez la mesure d'efficacité.";
          setLocal(errs);
          if (Object.keys(errs).length) return;
          m.mutate({
            title: v.title.trim(),
            root_cause: v.root_cause.trim(),
            category_id: v.category_id ? Number(v.category_id) : null,
            owner_id: v.owner_id ? Number(v.owner_id) : null,
            owner_entity_id: v.owner_entity_id ? Number(v.owner_entity_id) : null,
            due_at: v.due_at || null,
            status: v.status as QualityAction['status'],
            effectiveness_measure: v.effectiveness_measure.trim() || null,
            evidence: v.evidence.trim() || null,
          });
        }}
      >
        {err && <InfoBox tone="danger" role="alert">{err.message}</InfoBox>}
        <Input label="Action" required value={v.title} onChange={upd('title')} error={fe.title} />
        <Textarea label="Cause (à confirmer ou confirmée)" required rows={2} value={v.root_cause} onChange={upd('root_cause')} error={fe.root_cause} />
        <div className="formgrid">
          <Select label="Catégorie concernée" placeholder="Toutes" options={(ref.data?.categories ?? []).map((c) => ({ value: c.id, label: c.label }))} value={String(v.category_id)} onChange={upd('category_id')} />
          <Select label="État" options={toOptions(QUALITY_STATUS_LABELS)} value={v.status} onChange={upd('status')} />
          <Select label="Propriétaire" placeholder="À désigner" options={(ref.data?.users ?? []).filter((u) => u.role !== 'client' && u.role !== 'admin').map((u) => ({ value: u.id, label: u.name }))} value={String(v.owner_id)} onChange={upd('owner_id')} error={fe.owner_id} />
          <Select label="Entité responsable" placeholder="—" options={(ref.data?.entities ?? []).map((x) => ({ value: x.id, label: x.name }))} value={String(v.owner_entity_id)} onChange={upd('owner_entity_id')} />
          <Input label="Échéance" type="date" value={v.due_at} onChange={upd('due_at')} error={fe.due_at} />
        </div>
        <Textarea label="Mesure d'efficacité" rows={2} value={v.effectiveness_measure} onChange={upd('effectiveness_measure')} hint="Ex. volume mensuel de la catégorie avant/après, sur périmètre constant." error={fe.effectiveness_measure} />
        <Textarea label="Preuve de réalisation" rows={2} value={v.evidence} onChange={upd('evidence')} hint="Référence du document, note de service, capture…" error={fe.evidence} />
        <div className="form-actions" style={{ paddingBottom: 14 }}>
          <Button variant="alt" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={m.isPending}>
            {action ? 'Enregistrer' : "Créer l'action"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
