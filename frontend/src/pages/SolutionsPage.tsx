import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck } from 'lucide-react';
import { complaintsApi, solutionsApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { actorName, formatDate, formatMoney } from '@/lib/format';
import { Hero, PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { tabPanelProps } from '@/components/ui/tabPanel';
import { ResponsiveTable, type Column } from '@/components/ui/ResponsiveTable';
import { Pagination } from '@/components/ui/Pagination';
import { Badge, DecisionBadge, SolutionStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { ActionModal } from '@/features/complaint/ActionModal';
import { useToast } from '@/components/ui/toast-context';
import type { SolutionListItem } from '@/types/api';

type StatusTab = 'a_valider' | 'soumise' | 'approuvee_n1' | 'approuvee' | 'rejetee' | 'toutes';
const KEYS = ['statut', 'page'] as const;

export default function SolutionsPage() {
  useDocumentTitle('Solutions et validations');
  const { user } = useAuth();
  const { values, setMany } = useUrlFilters(KEYS, { statut: 'a_valider' });
  const status = values.statut as StatusTab;
  const apiStatus = status === 'toutes' ? undefined : status === 'a_valider' ? 'soumise,approuvee_n1' : status;
  const [approving, setApproving] = useState<{ s: SolutionListItem; decision: 'approuve' | 'rejete' } | null>(null);
  const [picking, setPicking] = useState(false);

  const q = useQuery({
    queryKey: ['solutions', status, values.page],
    queryFn: () => solutionsApi.list({ status: apiStatus, page: values.page }),
    placeholderData: keepPreviousData,
  });

  const levelFor = (s: SolutionListItem): 1 | 2 | null => {
    if (s.status === 'soumise' && can(user, 'solutions.approve_n1')) return 1;
    if (s.status === 'approuvee_n1' && s.requires_n2 && can(user, 'solutions.approve_n2')) return 2;
    return null;
  };

  const columns: Column<SolutionListItem>[] = [
    {
      key: 'ref',
      header: 'Référence',
      hideOnMobile: true,
      render: (s) => (
        <Link className="ref-link" to={`/app/reclamations/${s.complaint.id}?onglet=solution`}>
          {s.complaint.reference}
        </Link>
      ),
    },
    { key: 'measure', header: 'Mesure proposée', render: (s) => <>{s.type_label}<span className="cell-sub">v{s.version} · {s.complaint.subject}</span></> },
    { key: 'decision', header: 'Décision de fond', render: (s) => <DecisionBadge decision={s.decision} label={s.decision_label} /> },
    { key: 'amount', header: 'Montant', render: (s) => <span className="nowrap">{formatMoney(s.amount, s.currency)}</span> },
    { key: 'by', header: 'Proposée par', render: (s) => <>{actorName(s.proposed_by)}<span className="cell-sub">{formatDate(s.submitted_at, 'Non soumise')}</span></> },
    {
      key: 'validation',
      header: 'Validation',
      render: (s) => (
        <span className="badge-row">
          <SolutionStatusBadge status={s.status} label={s.status_label} />
          {s.requires_n2 && <Badge tone="warn" icon={ShieldCheck}>N2</Badge>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (s) => {
        const level = levelFor(s);
        if (!level) return <Link to={`/app/reclamations/${s.complaint.id}?onglet=solution`}>Ouvrir</Link>;
        return (
          <span className="row" style={{ gap: 6 }}>
            <Button size="sm" variant="danger-outline" onClick={() => setApproving({ s, decision: 'rejete' })} aria-label={`Rejeter la solution du dossier ${s.complaint.reference}`}>
              Rejeter
            </Button>
            <Button size="sm" variant="success" onClick={() => setApproving({ s, decision: 'approuve' })} aria-label={`Approuver (N${level}) la solution du dossier ${s.complaint.reference}`}>
              Approuver N{level}
            </Button>
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Résolution"
        title="Solutions et validations"
        sub="Une décision motivée et une réponse vérifiable pour chaque réclamation."
        actions={
          can(user, 'solutions.propose') && (
            <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setPicking(true)}>
              Proposer une solution
            </Button>
          )
        }
      />
      <Hero eyebrow="Parcours de résolution" title="Comprendre → décider → répondre → vérifier">
        La solution choisie, la décision de fond et la date d'envoi au client sont enregistrées séparément.
      </Hero>
      <section className="cols3" aria-label="Étapes">
        <Card as="article">
          <div className="stepnum">01 · INVESTIGATION</div>
          <h2>Établir les faits</h2>
          <p style={{ margin: 0 }}>Transaction, justificatifs, échanges, montants et cause possible sont rassemblés dans le dossier.</p>
        </Card>
        <Card as="article">
          <div className="stepnum">02 · DÉCISION</div>
          <h2>Choisir une mesure</h2>
          <p style={{ margin: 0 }}>Correction, remboursement éventuel, explication ou autre issue configurée par BSCA, avec validation si requise.</p>
        </Card>
        <Card as="article">
          <div className="stepnum">03 · RÉPONSE</div>
          <h2>Informer le client</h2>
          <p style={{ margin: 0 }}>Le message et la preuve d'envoi sont conservés ; une réouverture n'efface pas la réponse initiale.</p>
        </Card>
      </section>

      <section className="card spacing" aria-label="Propositions">
        <h2>Propositions de solution</h2>
        <Tabs<StatusTab>
          label="Filtrer par statut"
          idPrefix="sol"
          active={status}
          onChange={(k) => setMany({ statut: k })}
          tabs={[
            { key: 'a_valider', label: 'À valider' },
            { key: 'soumise', label: 'Attente N1' },
            { key: 'approuvee_n1', label: 'Attente N2' },
            { key: 'approuvee', label: 'Approuvées' },
            { key: 'rejetee', label: 'Rejetées' },
            { key: 'toutes', label: 'Toutes' },
          ]}
        />
        <div {...tabPanelProps('sol', status)}>
          {q.isPending ? (
            <SkeletonRows rows={5} cols={6} />
          ) : q.isError ? (
            <ErrorState message={toApiError(q.error).message} onRetry={() => q.refetch()} />
          ) : q.data.data.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Aucune proposition" description="Aucune solution ne correspond à ce statut dans votre périmètre." />
          ) : (
            <>
              <ResponsiveTable
                caption="Propositions de solution"
                columns={columns}
                rows={q.data.data}
                rowKey={(s) => s.id}
                mobileTitle={(s) => <Link className="ref-link" to={`/app/reclamations/${s.complaint.id}?onglet=solution`}>{s.complaint.reference}</Link>}
              />
              <Pagination meta={q.data.meta} onPage={(p) => setMany({ page: String(p) }, { resetPage: false })} />
            </>
          )}
        </div>
      </section>

      {approving && <ApproveListModal item={approving.s} decision={approving.decision} onClose={() => setApproving(null)} />}
      <PickComplaintModal open={picking} onClose={() => setPicking(false)} />
    </>
  );
}

function ApproveListModal({ item, decision, onClose }: { item: SolutionListItem; decision: 'approuve' | 'rejete'; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: (comment: string) => complaintsApi.approveSolution(item.id, decision, comment),
    onSuccess: async () => {
      toast.success(decision === 'approuve' ? `Solution du dossier ${item.complaint.reference} approuvée.` : 'Solution rejetée.');
      await qc.invalidateQueries({ queryKey: ['solutions'] });
      await qc.invalidateQueries({ queryKey: ['complaint', String(item.complaint.id)] });
    },
  });
  return (
    <ActionModal
      open
      onClose={onClose}
      title={`${decision === 'approuve' ? 'Approuver' : 'Rejeter'} · ${item.complaint.reference}`}
      description={`${item.type_label} (v${item.version}) · ${formatMoney(item.amount, item.currency)}`}
      submitLabel={decision === 'approuve' ? 'Approuver' : 'Rejeter'}
      submitVariant={decision === 'approuve' ? 'success' : 'danger-outline'}
      requireReason={decision === 'rejete'}
      reasonLabel="Commentaire (obligatoire en cas de rejet)"
      onSubmit={(r) => m.mutateAsync(r)}
      pending={m.isPending}
      error={m.isError ? toApiError(m.error) : null}
    >
      <p>
        Objet : {item.complaint.subject}.{' '}
        <Link to={`/app/reclamations/${item.complaint.id}?onglet=solution`}>Consulter le dossier complet</Link>
      </p>
    </ActionModal>
  );
}

function PickComplaintModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 300);
  const navigate = useNavigate();
  const search = useQuery({
    queryKey: ['pick', dq],
    queryFn: () => complaintsApi.list({ search: dq, per_page: '8', status: 'en_investigation' }),
    enabled: open,
  });
  return (
    <Modal open={open} onClose={onClose} title="Proposer une solution" description="Choisissez le dossier en investigation concerné.">
      <Input label="Rechercher un dossier" placeholder="Référence, objet ou client" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="links-list" style={{ margin: '8px 0 18px' }}>
        {(search.data?.data ?? []).map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                onClose();
                navigate(`/app/reclamations/${c.id}?onglet=solution&proposer=1`);
              }}
            >
              {c.reference}
            </button>
            <span className="caption">{c.subject}</span>
          </li>
        ))}
        {search.data && search.data.data.length === 0 && <li className="caption">Aucun dossier en investigation trouvé.</li>}
      </ul>
    </Modal>
  );
}
