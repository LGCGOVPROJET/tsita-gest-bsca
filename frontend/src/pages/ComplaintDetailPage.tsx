import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, GitBranch, Inbox, Link2, MailCheck, RotateCcw, Shuffle, Tags, UserPlus } from 'lucide-react';
import { complaintsApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { actorName, formatDate, formatDateTime, itemDate } from '@/lib/format';
import { DEADLINE_STATUS_LABELS, RULE_KIND_LABELS, RULE_UNIT_LABELS, STATUS_LABELS } from '@/lib/labels';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { tabPanelProps } from '@/components/ui/tabPanel';
import { Badge, DeadlineBadge, DecisionBadge, InternalBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';
import { Stat, StatList } from '@/components/ui/Stat';
import { Timeline } from '@/components/ui/Timeline';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonCard, Skeleton } from '@/components/ui/Skeleton';
import { FactsTab } from '@/features/complaint/FactsTab';
import { AttachmentsTab } from '@/features/complaint/AttachmentsTab';
import { ExchangesTab } from '@/features/complaint/ExchangesTab';
import { SolutionTab } from '@/features/complaint/SolutionTab';
import { ControlTab } from '@/features/complaint/ControlTab';
import { AuditTab } from '@/features/complaint/AuditTab';
import { AcknowledgeModal, AssignModal, DuplicateModal, QualifyModal, ReopenModal, TransitionModal } from '@/features/complaint/CaseModals';
import type { ComplaintDetail } from '@/types/api';
import { TrackingCodeModal } from '@/features/complaint/TrackingCodeModal';

type TabKey = 'faits' | 'pieces' | 'echanges' | 'solution' | 'controle' | 'audit';
type ModalKey = 'qualify' | 'assign' | 'transition' | 'ack' | 'reopen' | 'duplicate' | null;

export default function ComplaintDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [modal, setModal] = useState<ModalKey>(null);
  const [child, setChild] = useState<{ id?: number; reference?: string; code: string } | null>(null);
  const tab = (params.get('onglet') as TabKey) || 'faits';
  const setTab = (t: TabKey) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('onglet', t);
        n.delete('proposer');
        return n;
      },
      { replace: true },
    );

  const q = useQuery({ queryKey: ['complaint', id], queryFn: () => complaintsApi.get(id), enabled: /^\d+$/.test(id) });
  useDocumentTitle(q.data ? `Dossier ${q.data.reference}` : 'Détail du dossier');

  if (!/^\d+$/.test(id)) {
    return <EmptyState title="Dossier introuvable" description="L'identifiant fourni est invalide." action={<Link className="btn alt" to="/app/reclamations">Retour à la liste</Link>} />;
  }
  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) {
    const err = toApiError(q.error);
    return (
      <Card>
        {err.status === 404 || err.status === 403 ? (
          <EmptyState
            title={err.status === 404 ? 'Dossier introuvable' : 'Dossier hors de votre périmètre'}
            description={err.status === 404 ? "Ce dossier n'existe pas ou a été fusionné." : "Votre rôle ne permet pas de consulter ce dossier."}
            action={<Link className="btn alt" to="/app/reclamations">Retour à la liste</Link>}
          />
        ) : (
          <ErrorState message={err.message} onRetry={() => q.refetch()} />
        )}
      </Card>
    );
  }

  const c = q.data;
  const isDirection = user?.role === 'direction';
  const canAck =
    (c.can.acknowledge ?? (can(user, 'complaints.create') || can(user, 'complaints.respond'))) &&
    c.acknowledgment_status !== 'envoye' &&
    !['cloture', 'brouillon'].includes(c.status);
  const canReopen = c.can.reopen && ['reponse_envoyee', 'cloture'].includes(c.status);
  const canTransition = c.can.transition && c.allowed_transitions.some((t) => t.value !== 'reponse_envoyee');
  const finalDeadline = c.deadlines.find((d) => d.kind === 'reponse_finale');
  const demoRule = c.deadlines.some((d) => d.rule?.is_demo ?? d.rule_is_demo);

  const tabs = [
    { key: 'faits' as const, label: 'Faits' },
    { key: 'pieces' as const, label: 'Pièces', count: isDirection ? null : c.attachments.length },
    { key: 'echanges' as const, label: 'Échanges', count: c.messages.length },
    { key: 'solution' as const, label: 'Solution', count: c.solutions.length || null },
    { key: 'controle' as const, label: 'Contrôle', count: c.controls.length || null },
    { key: 'audit' as const, label: 'Audit' },
  ];

  return (
    <>
      <Link to="/app/reclamations" className="btn text" style={{ marginLeft: -8 }}>
        <ArrowLeft size={15} aria-hidden="true" /> Toutes les réclamations
      </Link>
      <div className="eyebrow" style={{ marginTop: 6 }}>
        Dossier · {c.channel?.label ?? 'Canal inconnu'}
      </div>
      <div className="heading">
        <div>
          <h1>
            Réclamation <span className="mono">{c.reference}</span>{' '}
            <button
              type="button"
              className="btn text sm"
              aria-label="Copier la référence"
              onClick={() => navigator.clipboard?.writeText(c.reference)}
            >
              <Copy size={15} aria-hidden="true" />
            </button>
          </h1>
          <p className="sub">
            {c.subject} · reçu le {formatDateTime(c.received_at)}
            {c.receiving_agency ? ` · agence ${c.receiving_agency.name}` : ''}
          </p>
        </div>
        <div className="badge-row">
          <StatusBadge status={c.status} label={c.status_label} />
          <DeadlineBadge flag={c.deadline_flag} label={c.deadline_flag_label} />
        </div>
      </div>

      {/* Bandeau du dossier */}
      <section className="card case-banner" aria-label="Synthèse du dossier">
        <div>
          <span className="cb-label">Statut</span>
          <StatusBadge status={c.status} label={c.status_label} />
        </div>
        <div>
          <span className="cb-label">Décision de fond</span>
          <DecisionBadge decision={c.decision} label={c.decision_label} />
        </div>
        <div>
          <span className="cb-label">Propriétaire</span>
          <strong>{c.owner?.name ?? 'Non affecté'}</strong>
          <span className="cell-sub">{c.processing_entity?.name ?? 'Fonction à déterminer'}{c.deputy ? ` · suppléant ${c.deputy.name}` : ''}</span>
        </div>
        <div>
          <span className="cb-label">Échéance de réponse</span>
          <strong>{formatDate(c.due_at, 'Non calculée')}</strong>
          <span style={{ display: 'block', marginTop: 4 }}>
            <DeadlineBadge flag={c.deadline_flag} label={c.deadline_flag_label} />
          </span>
        </div>
        <div>
          <span className="cb-label">Prochaine action</span>
          <span style={{ fontWeight: 600 }}>{c.next_action ?? '—'}</span>
        </div>
      </section>

      {demoRule && (
        <InfoBox tone="warn" role="note">
          Règle de démonstration — non validée par la conformité BSCA. L'échéance affichée est indicative.
        </InfoBox>
      )}
      {c.duplicate_of && (
        <InfoBox tone="info">
          Ce dossier est un doublon de{' '}
          <Link to={`/app/reclamations/${c.duplicate_of.id}`}>{c.duplicate_of.reference}</Link>. Il est conservé pour la traçabilité.
        </InfoBox>
      )}

      {/* Actions contextuelles */}
      {!isDirection && (
        <div className="case-actions" role="toolbar" aria-label="Actions sur le dossier">
          {c.can.qualify && (
            <Button variant="alt" icon={<Tags size={15} aria-hidden="true" />} onClick={() => setModal('qualify')}>
              Qualifier
            </Button>
          )}
          {c.can.assign && (
            <Button variant="alt" icon={<UserPlus size={15} aria-hidden="true" />} onClick={() => setModal('assign')}>
              {c.owner ? 'Réattribuer' : 'Affecter'}
            </Button>
          )}
          {canTransition && (
            <Button icon={<Shuffle size={15} aria-hidden="true" />} onClick={() => setModal('transition')}>
              Changer d'état
            </Button>
          )}
          {canAck && (
            <Button variant="blue" icon={<MailCheck size={15} aria-hidden="true" />} onClick={() => setModal('ack')}>
              Accuser réception
            </Button>
          )}
          {c.can.propose && !c.final_response_at && tab !== 'solution' && (
            <Button variant="alt" onClick={() => setTab('solution')}>
              Préparer une solution
            </Button>
          )}
          {canReopen && (
            <Button variant="alt" icon={<RotateCcw size={15} aria-hidden="true" />} onClick={() => setModal('reopen')}>
              Réouvrir
            </Button>
          )}
          {(c.can.mark_duplicate ?? (c.can.qualify && !c.duplicate_of)) && (
            <Button variant="text" icon={<Link2 size={15} aria-hidden="true" />} onClick={() => setModal('duplicate')}>
              Marquer doublon
            </Button>
          )}
        </div>
      )}

      <div className="twocol">
        <section className="card" aria-label="Contenu du dossier">
          <Tabs<TabKey> label="Sections du dossier" idPrefix="case" tabs={tabs} active={tab} onChange={setTab} />
          <div {...tabPanelProps('case', tab)}>
            {tab === 'faits' && <FactsTab c={c} />}
            {tab === 'pieces' &&
              (isDirection ? (
                <InfoBox tone="info">Le profil Direction n'a pas accès aux pièces nominatives.</InfoBox>
              ) : (
                <AttachmentsTab c={c} canUpload={c.can.attach ?? (c.can.transition || can(user, 'complaints.create'))} />
              ))}
            {tab === 'echanges' && <ExchangesTab c={c} canWrite={!isDirection && (c.can.note ?? (c.can.transition || c.can.respond || can(user, 'complaints.create')))} />}
            {tab === 'solution' && <SolutionTab c={c} openPropose={params.get('proposer') === '1'} />}
            {tab === 'controle' && <ControlTab c={c} canControl={c.can.control ?? can(user, 'quality.control')} />}
            {tab === 'audit' && <AuditTab audit={c.audit} />}
          </div>
        </section>

        <aside className="stack" aria-label="Informations complémentaires">
          <Card title="Fiche de suivi">
            <StatList>
              <Stat label="Référence">
                <span className="mono">{c.reference}</span>
              </Stat>
              <Stat label="Canal">{c.channel?.label ?? '—'}</Stat>
              <Stat label="Agence de réception">{c.receiving_agency?.name ?? 'Non applicable'}</Stat>
              <Stat label="Fonction de traitement">{c.processing_entity?.name ?? 'À déterminer'}</Stat>
              <Stat label="Client">{c.customer?.full_name ?? c.customer_name}</Stat>
              <Stat label="Décision de fond">
                <DecisionBadge decision={c.decision} label={c.decision_label} />
              </Stat>
              <Stat label="Clôture">{formatDate(c.closed_at, '—')}</Stat>
            </StatList>
          </Card>

          <DeadlinesCard c={c} finalRule={finalDeadline?.rule?.label ?? finalDeadline?.rule_label} />

          <Card title="Chronologie" caption="Horodatage Africa/Brazzaville">
            {c.timeline.length === 0 ? (
              <p className="caption">Aucun événement.</p>
            ) : (
              <Timeline
                label="Chronologie du dossier"
                items={[...c.timeline]
                  .sort((a, b) => itemDate(b).localeCompare(itemDate(a)))
                  .map((e) => ({
                    key: e.id,
                    variant: e.visibility === 'internal' ? 'internal' : 'default',
                    title: (
                      <>
                        {e.title}
                        {e.visibility === 'internal' && (
                          <>
                            {' '}
                            <InternalBadge />
                          </>
                        )}
                      </>
                    ),
                    meta: `${formatDateTime(itemDate(e))} · ${actorName(e.actor, 'Système')}`,
                    body: (
                      <>
                        {e.from_status && e.to_status && (
                          <span className="cell-sub">
                            {STATUS_LABELS[e.from_status] ?? e.from_status} → {STATUS_LABELS[e.to_status] ?? e.to_status}
                          </span>
                        )}
                        {e.description}
                        {e.reason && <span className="cell-sub">Motif : {e.reason}</span>}
                      </>
                    ),
                  }))}
              />
            )}
          </Card>

          {(c.parent || c.children.length > 0) && (
            <Card title="Dossiers liés">
              <ul className="links-list">
                {c.parent && (
                  <li>
                    <span>
                      <GitBranch size={15} aria-hidden="true" /> Dossier d'origine
                    </span>
                    <Link className="ref-link" to={`/app/reclamations/${c.parent.id}`}>
                      {c.parent.reference}
                    </Link>
                  </li>
                )}
                {c.children.map((ch) => (
                  <li key={ch.id}>
                    <Link className="ref-link" to={`/app/reclamations/${ch.id}`}>
                      {ch.reference}
                    </Link>
                    <StatusBadge status={ch.status} label={ch.status_label} />
                  </li>
                ))}
              </ul>
              <p className="caption" style={{ marginTop: 8 }}>
                Une réouverture crée un dossier enfant ; la réponse initiale reste consultable.
              </p>
            </Card>
          )}

          <Card title="Séparation des accès">
            <p style={{ margin: 0 }}>
              La chronologie interne, les notes des agents, les avis de contrôle et les pièces confidentielles ne sont pas publiés dans le suivi
              client.
            </p>
          </Card>
        </aside>
      </div>

      {modal === 'qualify' && <QualifyModal c={c} open onClose={() => setModal(null)} />}
      {modal === 'assign' && <AssignModal c={c} open onClose={() => setModal(null)} />}
      {modal === 'transition' && <TransitionModal c={c} open onClose={() => setModal(null)} />}
      {modal === 'ack' && <AcknowledgeModal c={c} open onClose={() => setModal(null)} />}
      {modal === 'duplicate' && <DuplicateModal c={c} open onClose={() => setModal(null)} />}
      {modal === 'reopen' && (
        <ReopenModal
          c={c}
          open
          onClose={() => setModal(null)}
          onReopened={(r) => {
            if (r.trackingCode && r.reference) setChild({ id: r.id, reference: r.reference, code: r.trackingCode });
            else if (r.id) navigate(`/app/reclamations/${r.id}`);
          }}
        />
      )}
      {child && (
        <TrackingCodeModal
          title="Dossier enfant créé"
          reference={child.reference ?? ''}
          code={child.code}
          onClose={() => {
            const id = child.id;
            setChild(null);
            if (id) navigate(`/app/reclamations/${id}`);
          }}
        />
      )}
    </>
  );
}

function DeadlinesCard({ c, finalRule }: { c: ComplaintDetail; finalRule?: string }) {
  return (
    <Card title="Échéances" caption={finalRule ? `Règle : ${finalRule}` : 'Calcul Africa/Brazzaville'}>
      {c.deadlines.length === 0 ? (
        <InfoBox tone="warn">Aucune règle de délai validée n'est applicable à ce dossier.</InfoBox>
      ) : (
        <ul className="links-list">
          {c.deadlines.map((d) => (
            <li key={d.id} style={{ display: 'block', borderBottom: '1px solid var(--line-soft)', paddingBottom: 8 }}>
              <div className="row between">
                <strong>{d.kind_label ?? RULE_KIND_LABELS[d.kind] ?? d.kind}</strong>
                <Badge
                  tone={d.status === 'depassee' ? 'danger' : d.status === 'respectee_en_retard' ? 'warn' : d.status === 'respectee' ? 'success' : 'info'}
                  icon={Inbox}
                >
                  {d.status_label ?? DEADLINE_STATUS_LABELS[d.status] ?? d.status}
                </Badge>
              </div>
              <span className="cell-sub">
                Échéance {formatDateTime(d.due_at)} · {RULE_UNIT_LABELS[d.unit] ?? d.unit}
                {(d.rule?.version ?? d.rule_version) ? ` · règle v${d.rule?.version ?? d.rule_version}` : ''}
                {(d.rule?.is_demo ?? d.rule_is_demo) ? ' · démonstration' : ''}
              </span>
              {d.initial_due_at !== d.due_at && <span className="cell-sub">Échéance initiale conservée : {formatDateTime(d.initial_due_at)}</span>}
              {d.announced_at && <span className="cell-sub">Nouvelle date annoncée au client : {formatDate(d.announced_at)}</span>}
              {d.met_at && <span className="cell-sub">Respectée le {formatDateTime(d.met_at)}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Chargement du dossier">
      <span className="sr-only">Chargement du dossier…</span>
      <Skeleton width={120} height={12} />
      <Skeleton width={380} height={30} style={{ margin: '10px 0' }} />
      <Skeleton width="100%" height={80} style={{ margin: '14px 0' }} />
      <div className="twocol">
        <SkeletonCard lines={8} />
        <div className="stack">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={4} />
        </div>
      </div>
    </div>
  );
}
