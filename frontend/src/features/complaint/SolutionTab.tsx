import { useState } from 'react';
import { CheckCircle2, Plus, Send, ShieldCheck, XCircle } from 'lucide-react';
import { complaintsApi } from '@/api/endpoints';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useReferentials } from '@/hooks/useReferentials';
import { actorName, formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { CURRENCIES, DECISION_LABELS, SOLUTION_TYPE_LABELS, toOptions } from '@/lib/labels';
import { normalizeAmount } from '@/lib/validation';
import { Badge, DecisionBadge, SolutionStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoBox } from '@/components/ui/InfoBox';
import type { ComplaintDetail, Solution } from '@/types/api';
import { ActionModal } from './ActionModal';
import { fillTemplate } from './template';
import { useCaseMutation } from './useCaseMutation';

export function SolutionTab({ c, openPropose = false }: { c: ComplaintDetail; openPropose?: boolean }) {
  const { user } = useAuth();
  const [proposing, setProposing] = useState(openPropose && c.can.propose);
  const [approving, setApproving] = useState<{ s: Solution; decision: 'approuve' | 'rejete' } | null>(null);
  const [responding, setResponding] = useState(false);
  const versions = [...c.solutions].sort((a, b) => b.version - a.version);
  const current = versions[0];
  const approved = versions.find((s) => s.status === 'approuvee');

  const submit = useCaseMutation(c.id, (id: number) => complaintsApi.submitSolution(id), 'Solution soumise à validation.');

  const canApproveLevel = (s: Solution): 1 | 2 | null => {
    if (!c.can.approve) return null;
    if (s.status === 'soumise' && can(user, 'solutions.approve_n1')) return 1;
    if (s.status === 'approuvee_n1' && s.requires_n2 && can(user, 'solutions.approve_n2')) return 2;
    return null;
  };

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <p className="caption" style={{ margin: 0 }}>
          Les versions ne sont jamais écrasées. Validation N1 par le responsable ; N2 par la conformité au-delà du seuil (500 000 XAF).
        </p>
        <div className="row">
          {c.can.propose && !c.final_response_at && !proposing && (
            <Button icon={<Plus size={15} aria-hidden="true" />} onClick={() => setProposing(true)}>
              {current ? 'Nouvelle version' : 'Proposer une solution'}
            </Button>
          )}
          {c.can.respond && approved && (
            <Button variant="success" icon={<Send size={15} aria-hidden="true" />} onClick={() => setResponding(true)}>
              Envoyer la réponse
            </Button>
          )}
        </div>
      </div>

      {proposing && <ProposeForm c={c} base={current} onDone={() => setProposing(false)} />}

      {versions.length === 0 && !proposing ? (
        <EmptyState icon={ShieldCheck} title="Aucune solution proposée" description="Établissez les faits, puis proposez une mesure et une décision de fond motivée." />
      ) : (
        versions.map((s) => {
          const level = canApproveLevel(s);
          return (
            <article key={s.id} className={`solution-card ${s === current ? 'current' : ''}`} aria-label={`Solution version ${s.version}`}>
              <header>
                <div className="badge-row">
                  <strong>Version {s.version}</strong>
                  <span>· {s.type_label ?? SOLUTION_TYPE_LABELS[s.type] ?? s.type}</span>
                  {s === current && <Badge tone="outline">Version courante</Badge>}
                </div>
                <div className="badge-row">
                  <DecisionBadge decision={s.decision} label={s.decision_label} />
                  <SolutionStatusBadge status={s.status} label={s.status_label} />
                  {s.requires_n2 && <Badge tone="warn" icon={ShieldCheck}>Validation N2 requise</Badge>}
                </div>
              </header>
              <p className="pre-wrap" style={{ margin: '0 0 8px' }}>
                {s.description}
              </p>
              <dl className="stats">
                <div className="stat">
                  <dt>Cause racine</dt>
                  <dd>{s.root_cause || 'Non renseignée'}</dd>
                </div>
                <div className="stat">
                  <dt>Montant</dt>
                  <dd>{formatMoney(s.amount, s.currency)}</dd>
                </div>
                <div className="stat">
                  <dt>Proposée par</dt>
                  <dd>
                    {actorName(s.proposed_by)} {s.submitted_at ? `· soumise le ${formatDateTime(s.submitted_at)}` : s.created_at ? `· ${formatDateTime(s.created_at)}` : ''}
                  </dd>
                </div>
              </dl>
              {s.approvals.length > 0 && (
                <ul className="approvals" aria-label="Validations">
                  {s.approvals.map((a, i) => (
                    <li key={a.id ?? i}>
                      {a.decision === 'approuve' ? <CheckCircle2 size={16} color="var(--success)" aria-hidden="true" /> : <XCircle size={16} color="var(--danger)" aria-hidden="true" />}
                      <strong>
                        N{a.level} · {a.decision === 'approuve' ? 'Approuvée' : 'Rejetée'}
                      </strong>
                      par {actorName(a.approver)} le {formatDateTime(a.decided_at)}
                      {a.comment && <span className="muted">— « {a.comment} »</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="row end" style={{ marginTop: 10 }}>
                {s.status === 'brouillon' && c.can.propose && (
                  <Button size="sm" variant="blue" loading={submit.isPending} onClick={() => submit.mutate(s.id)}>
                    Soumettre à validation
                  </Button>
                )}
                {level && (
                  <>
                    <Button size="sm" variant="danger-outline" onClick={() => setApproving({ s, decision: 'rejete' })}>
                      Rejeter (N{level})
                    </Button>
                    <Button size="sm" variant="success" onClick={() => setApproving({ s, decision: 'approuve' })}>
                      Approuver (N{level})
                    </Button>
                  </>
                )}
              </div>
            </article>
          );
        })
      )}

      {approving && <ApproveModal c={c} s={approving.s} decision={approving.decision} onClose={() => setApproving(null)} />}
      {responding && approved && <SendResponseModal c={c} solution={approved} onClose={() => setResponding(false)} />}
    </div>
  );
}

function ProposeForm({ c, base, onDone }: { c: ComplaintDetail; base?: Solution; onDone: () => void }) {
  const ref = useReferentials();
  const [v, setV] = useState({
    type: base?.type ?? 'explication_motivee',
    decision: base?.decision ?? '',
    description: base?.description ?? '',
    root_cause: base?.root_cause ?? '',
    amount: base?.amount ?? '',
    currency: base?.currency ?? c.currency ?? 'XAF',
  });
  const [local, setLocal] = useState<Record<string, string>>({});
  const upd = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const m = useCaseMutation(
    c.id,
    () => {
      const amount = normalizeAmount(v.amount);
      return complaintsApi.proposeSolution(c.id, {
        type: v.type,
        decision: v.decision,
        description: v.description.trim(),
        root_cause: v.root_cause.trim() || undefined,
        amount,
        currency: amount === null ? null : v.currency,
      });
    },
    'Nouvelle version de solution enregistrée.',
  );
  const fe = { ...local, ...(m.apiError?.fieldErrors ?? {}) };
  const amt = Number(normalizeAmount(v.amount) ?? 0);

  return (
    <form
      className="card flat"
      style={{ marginBottom: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const errs: Record<string, string> = {};
        if (!v.decision) errs.decision = 'Choisissez la décision de fond.';
        if (v.description.trim().length < 20) errs.description = 'Motivez la solution (20 caractères minimum).';
        if (v.amount && normalizeAmount(v.amount) !== null && !/^\d+(\.\d{1,2})?$/.test(normalizeAmount(v.amount)!)) errs.amount = 'Montant invalide.';
        setLocal(errs);
        if (Object.keys(errs).length) return;
        try {
          await m.mutateAsync(undefined);
          onDone();
        } catch {
          /* affiché */
        }
      }}
      noValidate
    >
      <h3>{base ? `Nouvelle version (v${base.version + 1})` : 'Proposer une solution'}</h3>
      {m.apiError && <InfoBox tone="danger">{m.apiError.message}</InfoBox>}
      <div className="formgrid">
        <Select label="Mesure proposée" required options={ref.data?.solution_types?.length ? ref.data.solution_types : toOptions(SOLUTION_TYPE_LABELS)} value={v.type} onChange={upd('type')} error={fe.type} />
        <Select label="Décision de fond" required placeholder="Choisir…" options={ref.data?.decisions?.length ? ref.data.decisions : toOptions(DECISION_LABELS)} value={v.decision} onChange={upd('decision')} error={fe.decision} hint="Indépendante de l'état du traitement." />
      </div>
      <Textarea label="Description et motivation" required rows={4} value={v.description} onChange={upd('description')} error={fe.description} />
      <Textarea label="Cause racine" rows={2} value={v.root_cause} onChange={upd('root_cause')} hint="Cause confirmée, distincte du motif déclaré par le client." />
      <div className="formgrid">
        <Input label="Montant restitué éventuel" inputMode="decimal" placeholder="Aucun / inconnu" value={v.amount} onChange={upd('amount')} error={fe.amount} />
        <Select label="Devise" options={CURRENCIES.map((x) => ({ value: x, label: x }))} value={v.currency} onChange={upd('currency')} disabled={!v.amount} />
      </div>
      {v.currency === 'XAF' && amt >= 500000 && <InfoBox tone="warn">Montant supérieur ou égal au seuil : une validation N2 (conformité) sera requise.</InfoBox>}
      <div className="form-actions">
        <Button variant="alt" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" loading={m.isPending}>
          Enregistrer la version
        </Button>
      </div>
    </form>
  );
}

function ApproveModal({ c, s, decision, onClose }: { c: ComplaintDetail; s: Solution; decision: 'approuve' | 'rejete'; onClose: () => void }) {
  const isN2 = s.status === 'approuvee_n1' && s.requires_n2;
  const m = useCaseMutation(c.id, (comment: string) => complaintsApi.approveSolution(s.id, decision, comment), decision === 'approuve' ? 'Solution approuvée.' : 'Solution rejetée.');
  return (
    <ActionModal
      open
      onClose={onClose}
      title={decision === 'approuve' ? `Approuver la version ${s.version}` : `Rejeter la version ${s.version}`}
      description={`${s.type_label ?? SOLUTION_TYPE_LABELS[s.type]} · ${formatMoney(s.amount, s.currency)}`}
      submitLabel={decision === 'approuve' ? 'Approuver' : 'Rejeter'}
      submitVariant={decision === 'approuve' ? 'success' : 'danger-outline'}
      requireReason={decision === 'rejete'}
      reasonLabel="Commentaire (obligatoire en cas de rejet)"
      onSubmit={(reason) => m.mutateAsync(reason)}
      pending={m.isPending}
      error={m.apiError}
      effect={
        decision === 'approuve'
          ? [
              isN2 ? <>Validation de niveau 2 (conformité) : la solution deviendra <b>approuvée</b> et la réponse pourra être envoyée.</> : s.requires_n2 ? <>Validation de niveau 1 : une validation N2 (conformité) restera requise.</> : <>La solution deviendra <b>approuvée</b> et la réponse pourra être envoyée.</>,
              <>Votre nom, la date et le niveau de validation sont enregistrés dans l'audit.</>,
            ]
          : [<>La version est rejetée ; le dossier revient en « Solution proposée » pour une nouvelle version.</>, <>Le commentaire est transmis au gestionnaire et tracé.</>]
      }
      confirm={
        decision === 'approuve' && isN2
          ? {
              title: 'Confirmer la validation de niveau 2 ?',
              body: (
                <p>
                  Vous engagez la conformité sur une mesure de <b>{formatMoney(s.amount, s.currency)}</b>. Cette validation est définitive : une correction exigera une nouvelle version de la solution.
                </p>
              ),
              confirmLabel: 'Oui, valider (N2)',
            }
          : undefined
      }
    >
      <p className="pre-wrap">{s.description}</p>
    </ActionModal>
  );
}

function SendResponseModal({ c, solution, onClose }: { c: ComplaintDetail; solution: Solution; onClose: () => void }) {
  const ref = useReferentials();
  const templates = (ref.data?.templates ?? []).filter((t) => (t.kind === 'reponse' || t.kind === 'cloture') && t.is_active !== false);
  const [template, setTemplate] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState('courriel');
  const m = useCaseMutation(
    c.id,
    () => complaintsApi.sendResponse(c.id, { body: body.trim(), template_id: template ? Number(template) : null, channel }),
    'Réponse définitive envoyée : la date de réponse finale est enregistrée.',
  );
  return (
    <ActionModal
      open
      onClose={onClose}
      wide
      title="Envoyer la réponse définitive"
      description={
        <>
          Décision copiée : <DecisionBadge decision={solution.decision} label={solution.decision_label} />. L'envoi fixe la date de réponse finale.
        </>
      }
      submitLabel="Envoyer au client"
      submitVariant="success"
      requireReason={false}
      onSubmit={() => {
        if (body.trim().length < 20) return Promise.reject(new Error('court'));
        return m.mutateAsync(undefined);
      }}
      pending={m.isPending}
      error={m.apiError}
      canSubmit={body.trim().length >= 20}
      effect={[
        <>
          Le dossier passe en <b>« Réponse envoyée »</b> ; le client verra « Réponse envoyée » et le texte de la réponse dans son suivi.
        </>,
        <>
          La date de réponse finale est fixée maintenant{c.due_at ? <> (échéance : {formatDate(c.due_at)})</> : null} et la décision de fond est copiée sur le dossier.
        </>,
        <>La preuve d'envoi est conservée ; un échec de distribution restera visible.</>,
      ]}
      confirm={{
        title: 'Envoyer la réponse au client ?',
        body: (
          <p>
            La réponse sera envoyée par <b>{(ref.data?.channels ?? []).find((x) => x.code === channel)?.label ?? channel}</b> et ne pourra pas être modifiée. La décision « {solution.decision_label ?? (solution.decision ? DECISION_LABELS[solution.decision] : "à déterminer")} » sera enregistrée.
          </p>
        ),
        confirmLabel: 'Confirmer l\'envoi',
      }}
    >
      {templates.length > 0 ? (
        <Select
          label="Modèle de réponse"
          placeholder="Rédaction libre"
          options={templates.map((t) => ({ value: t.id, label: `${t.label} · v${t.version}` }))}
          value={template}
          onChange={(e) => {
            setTemplate(e.target.value);
            const t = templates.find((x) => String(x.id) === e.target.value);
            if (t) setBody(fillTemplate(t.body, c));
          }}
          hint="Les champs {{reference}}, {{client}} et {{date_limite}} sont remplis automatiquement."
        />
      ) : (
        <InfoBox tone="info">Aucun modèle de réponse n'est disponible pour votre profil : rédigez la réponse ci-dessous.</InfoBox>
      )}
      <Select label="Canal d'envoi" options={(ref.data?.channels ?? []).map((x) => ({ value: x.code, label: x.label }))} value={channel} onChange={(e) => setChannel(e.target.value)} />
      <Textarea label="Réponse au client" required rows={9} value={body} onChange={(e) => setBody(e.target.value)} hint="20 caractères minimum. Le message et la preuve d'envoi sont conservés." error={m.apiError?.fieldErrors.body} />
    </ActionModal>
  );
}
