import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { complaintsApi } from '@/api/endpoints';
import { useReferentials } from '@/hooks/useReferentials';
import { useDebounce } from '@/hooks/useDebounce';
import { CLIENT_STATUS_OF, CURRENCIES, PRIORITY_LABELS, STATUS_LABELS, RISK_LABELS, ROLE_LABELS, TEMPLATE_KIND_LABELS, toOptions } from '@/lib/labels';
import { normalizeAmount } from '@/lib/validation';
import { formatDate } from '@/lib/format';
import { Input, Select } from '@/components/ui/Field';
import { InfoBox } from '@/components/ui/InfoBox';
import { StatusBadge } from '@/components/ui/Badge';
import type { ComplaintDetail, ComplaintStatus } from '@/types/api';
import { ActionModal } from './ActionModal';
import { useCaseMutation } from './useCaseMutation';

interface BaseProps {
  c: ComplaintDetail;
  open: boolean;
  onClose: () => void;
}

export function QualifyModal({ c, open, onClose }: BaseProps) {
  const ref = useReferentials();
  const r = ref.data;
  const [v, setV] = useState({
    category_id: c.category ? String(c.category.id) : '',
    product_id: c.product ? String(c.product.id) : '',
    processing_entity_id: c.processing_entity ? String(c.processing_entity.id) : '',
    priority: c.priority ?? 'normale',
    risk_level: c.risk_level ?? 'faible',
    amount: c.amount ?? '',
    currency: c.currency ?? 'XAF',
    subject: c.subject,
  });
  const upd = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const m = useCaseMutation(c.id, (reason: string) => {
    const amount = normalizeAmount(v.amount);
    return complaintsApi.qualify(c.id, {
      category_id: v.category_id ? Number(v.category_id) : null,
      product_id: v.product_id ? Number(v.product_id) : null,
      processing_entity_id: v.processing_entity_id ? Number(v.processing_entity_id) : null,
      priority: v.priority,
      risk_level: v.risk_level,
      amount,
      currency: amount === null ? null : v.currency,
      subject: v.subject,
      reason,
    });
  }, 'Qualification enregistrée.');
  const fe = m.apiError?.fieldErrors ?? {};

  return (
    <ActionModal
      open={open}
      onClose={onClose}
      title="Qualifier le dossier"
      description="Nature, produit, fonction de traitement, urgence et montant. Les valeurs avant/après sont conservées dans l'audit."
      submitLabel="Enregistrer la qualification"
      onSubmit={(reason) => m.mutateAsync(reason)}
      pending={m.isPending}
      error={m.apiError}
      wide
    >
      <Input label="Objet" value={v.subject} onChange={upd('subject')} error={fe.subject} />
      <div className="formgrid">
        <Select label="Catégorie (nature)" placeholder="Non qualifiée" options={(r?.categories ?? []).map((x) => ({ value: x.id, label: x.label }))} value={v.category_id} onChange={upd('category_id')} error={fe.category_id} />
        <Select label="Produit" placeholder="Non précisé" options={(r?.products ?? []).map((x) => ({ value: x.id, label: x.label }))} value={v.product_id} onChange={upd('product_id')} error={fe.product_id} />
        <Select label="Fonction de traitement" placeholder="À déterminer" options={(r?.entities ?? []).map((x) => ({ value: x.id, label: x.name }))} value={v.processing_entity_id} onChange={upd('processing_entity_id')} error={fe.processing_entity_id} />
        <Select label="Priorité" options={r?.priorities?.length ? r.priorities : toOptions(PRIORITY_LABELS)} value={v.priority} onChange={upd('priority')} />
        <Select label="Niveau de risque" options={r?.risk_levels?.length ? r.risk_levels : toOptions(RISK_LABELS)} value={v.risk_level} onChange={upd('risk_level')} />
        <div className="formgrid" style={{ gap: '0 10px' }}>
          <Input label="Montant" inputMode="decimal" placeholder="Inconnu" hint="Vide = inconnu" value={v.amount} onChange={upd('amount')} error={fe.amount} />
          <Select label="Devise" options={CURRENCIES.map((x) => ({ value: x, label: x }))} value={v.currency} onChange={upd('currency')} disabled={!v.amount} />
        </div>
      </div>
    </ActionModal>
  );
}

export function AssignModal({ c, open, onClose }: BaseProps) {
  const ref = useReferentials();
  const r = ref.data;
  const [entity, setEntity] = useState(c.processing_entity ? String(c.processing_entity.id) : '');
  const [owner, setOwner] = useState(c.owner ? String(c.owner.id) : '');
  const [deputy, setDeputy] = useState(c.deputy ? String(c.deputy.id) : '');
  const staff = (r?.users ?? []).filter((u) => ['gestionnaire', 'responsable'].includes(u.role));
  const inEntity = entity ? staff.filter((u) => String(u.entity_id) === entity) : staff;
  const opts = (inEntity.length ? inEntity : staff).map((u) => ({ value: u.id, label: `${u.name} · ${ROLE_LABELS[u.role] ?? u.role}` }));
  const m = useCaseMutation(
    c.id,
    (reason: string) =>
      complaintsApi.assign(c.id, {
        owner_id: Number(owner),
        deputy_id: deputy ? Number(deputy) : null,
        processing_entity_id: entity ? Number(entity) : null,
        reason,
      }),
    'Dossier affecté.',
  );
  return (
    <ActionModal
      open={open}
      onClose={onClose}
      title={c.owner ? 'Réattribuer le dossier' : 'Affecter le dossier'}
      description="Un propriétaire unique, un suppléant éventuel. L'agence de dépôt reste distincte de la fonction de traitement."
      submitLabel="Affecter"
      effect={[<>Le propriétaire est notifié et devient responsable unique du dossier.</>, <>Le client ne voit pas le nom de l'agent ; son suivi indique « En cours d'analyse ».</>]}
      onSubmit={(reason) => m.mutateAsync(reason)}
      pending={m.isPending}
      error={m.apiError}
      canSubmit={Boolean(owner)}
    >
      <Select label="Fonction de traitement" placeholder="Inchangée" options={(r?.entities ?? []).map((x) => ({ value: x.id, label: x.name }))} value={entity} onChange={(e) => setEntity(e.target.value)} />
      <Select label="Propriétaire" required placeholder="Choisir…" options={opts} value={owner} onChange={(e) => setOwner(e.target.value)} error={m.apiError?.fieldErrors.owner_id} />
      <Select label="Suppléant" placeholder="Aucun" options={opts.filter((o) => String(o.value) !== owner)} value={deputy} onChange={(e) => setDeputy(e.target.value)} />
    </ActionModal>
  );
}

export function TransitionModal({ c, open, onClose, preset }: BaseProps & { preset?: ComplaintStatus }) {
  const options = c.allowed_transitions.filter((t) => t.value !== 'reponse_envoyee');
  const [to, setTo] = useState<string>(preset ?? options[0]?.value ?? '');
  const m = useCaseMutation(c.id, (reason: string) => complaintsApi.transition(c.id, to as ComplaintStatus, reason), 'État du dossier mis à jour.');
  return (
    <ActionModal
      open={open}
      onClose={onClose}
      title="Changer l'état du traitement"
      description={
        <>
          État actuel : <StatusBadge status={c.status} label={c.status_label} />. Seules les transitions autorisées sont proposées.
        </>
      }
      submitLabel="Confirmer le changement"
      onSubmit={(reason) => m.mutateAsync(reason)}
      pending={m.isPending}
      error={m.apiError}
      canSubmit={Boolean(to)}
      effect={to ? transitionEffect(c, to as ComplaintStatus) : undefined}
    >
      {options.length === 0 ? (
        <InfoBox tone="warn">Aucune transition manuelle n'est possible depuis cet état.</InfoBox>
      ) : (
        <fieldset className="fieldset">
          <legend>Nouvel état</legend>
          <div className="choice-row">
            {options.map((o) => (
              <label key={o.value} className="choice">
                <input type="radio" name="to_status" value={o.value} checked={to === o.value} onChange={() => setTo(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {to === 'attente_information' && (
        <InfoBox tone="warn">L'échéance n'est pas suspendue pendant l'attente d'information.</InfoBox>
      )}
    </ActionModal>
  );
}

/** Résumé de l'effet d'une transition : état interne, vue client, échéance, traçabilité. */
function transitionEffect(c: ComplaintDetail, to: ComplaintStatus) {
  const clientNow = CLIENT_STATUS_OF[c.status];
  const clientNext = CLIENT_STATUS_OF[to];
  return [
    <>
      État du traitement : <b>{STATUS_LABELS[c.status] ?? c.status}</b> → <b>{STATUS_LABELS[to] ?? to}</b>.
    </>,
    clientNow === clientNext ? (
      <>
        Le client verra toujours : <b>« {clientNext} »</b> (aucun changement dans son suivi).
      </>
    ) : (
      <>
        Le client verra : <b>« {clientNext} »</b> (au lieu de « {clientNow} »).
      </>
    ),
    c.due_at ? (
      <>
        Échéance de réponse maintenue au <b>{formatDate(c.due_at)}</b>
        {to === 'attente_information' ? ' : elle n\'est pas suspendue pendant l\'attente.' : '.'}
      </>
    ) : (
      <>Aucune échéance calculée pour ce dossier.</>
    ),
    <>Le motif sera enregistré dans la chronologie et le journal d'audit.</>,
  ];
}

export function AcknowledgeModal({ c, open, onClose }: BaseProps) {
  const ref = useReferentials();
  const templates = (ref.data?.templates ?? []).filter((t) => t.kind === 'accuse' && t.is_active !== false);
  const [template, setTemplate] = useState('');
  const [channel, setChannel] = useState('courriel');
  const [delivery, setDelivery] = useState('envoye');
  const m = useCaseMutation(
    c.id,
    () => complaintsApi.acknowledge(c.id, { template_id: template ? Number(template) : null, channel, delivery_status: delivery }),
    delivery === 'echec' ? "Échec d'envoi de l'accusé enregistré : il reste visible." : 'Accusé de réception enregistré.',
  );
  return (
    <ActionModal
      open={open}
      onClose={onClose}
      title="Accuser réception"
      description="Enregistre la date, le canal et la preuve d'envoi. Un échec de distribution reste visible dans le dossier."
      submitLabel="Enregistrer l'accusé"
      requireReason={false}
      onSubmit={() => m.mutateAsync(undefined)}
      pending={m.isPending}
      error={m.apiError}
      submitVariant="blue"
    >
      {templates.length > 0 && (
        <Select label={`Modèle (${TEMPLATE_KIND_LABELS.accuse})`} placeholder="Sans modèle" options={templates.map((t) => ({ value: t.id, label: `${t.label} · v${t.version}` }))} value={template} onChange={(e) => setTemplate(e.target.value)} />
      )}
      <Select label="Canal d'envoi" options={(ref.data?.channels ?? []).filter((x) => x.code !== 'portail').map((x) => ({ value: x.code, label: x.label }))} value={channel} onChange={(e) => setChannel(e.target.value)} />
      <fieldset className="fieldset">
        <legend>Statut de distribution</legend>
        <div className="choice-row">
          {[
            ['envoye', 'Envoyé'],
            ['en_attente', 'En attente'],
            ['echec', "Échec d'envoi"],
          ].map(([val, lbl]) => (
            <label key={val} className="choice">
              <input type="radio" name="delivery" value={val} checked={delivery === val} onChange={() => setDelivery(val!)} />
              {lbl}
            </label>
          ))}
        </div>
      </fieldset>
    </ActionModal>
  );
}

export function ReopenModal({
  c,
  open,
  onClose,
  onReopened,
}: BaseProps & { onReopened: (r: { id?: number; reference?: string; trackingCode: string | null }) => void }) {
  const m = useCaseMutation(c.id, (reason: string) => complaintsApi.reopen(c.id, reason), (r) => {
    const ref = (r as { reference?: string } | undefined)?.reference;
    return ref ? `Dossier enfant ${ref} créé.` : 'Réouverture enregistrée : un dossier enfant a été créé.';
  });
  return (
    <ActionModal
      open={open}
      onClose={onClose}
      title="Réouvrir le dossier"
      description="Crée un dossier enfant lié. Le dossier actuel et sa réponse initiale restent consultables et inchangés."
      submitLabel="Réouvrir"
      effect={[
        <>Un <b>dossier enfant</b> est créé au statut « Réouvert », lié à {c.reference}.</>,
        <>Le dossier d'origine, sa réponse et sa décision restent intacts et consultables.</>,
        <>Le client verra : <b>« Réouverte »</b>. Les échéances du dossier enfant sont recalculées.</>,
      ]}
      reasonLabel="Motif de la réouverture (contestation, élément nouveau…)"
      onSubmit={async (reason) => {
        const r = (await m.mutateAsync(reason)) as { id?: number; reference?: string; trackingCode: string | null };
        onReopened(r);
      }}
      pending={m.isPending}
      error={m.apiError}
    />
  );
}

export function DuplicateModal({ c, open, onClose }: BaseProps) {
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<{ id: number; reference: string } | null>(null);
  const dq = useDebounce(q.trim(), 300);
  const search = useQuery({
    queryKey: ['dup-search', dq],
    queryFn: () => complaintsApi.list({ search: dq, per_page: '6' }),
    enabled: open && dq.length >= 3,
  });
  const m = useCaseMutation(c.id, (reason: string) => complaintsApi.markDuplicate(c.id, target!.id, reason), 'Dossier marqué comme doublon (aucune suppression).');
  const results = (search.data?.data ?? []).filter((x) => x.id !== c.id);
  return (
    <ActionModal
      open={open}
      onClose={onClose}
      title="Marquer comme doublon"
      description="Le dossier est rattaché au dossier principal. Rien n'est supprimé."
      submitLabel="Marquer comme doublon"
      effect={[<>Ce dossier sera lié au dossier principal choisi. <b>Aucun dossier n'est supprimé.</b></>, <>Le motif est tracé dans la chronologie et l'audit.</>]}
      onSubmit={(reason) => m.mutateAsync(reason)}
      pending={m.isPending}
      error={m.apiError}
      canSubmit={Boolean(target)}
    >
      <Input label="Rechercher le dossier principal" placeholder="Référence ou objet (3 caractères min.)" value={q} onChange={(e) => setQ(e.target.value)} />
      {target && (
        <InfoBox tone="info">
          Dossier principal sélectionné : <strong>{target.reference}</strong>{' '}
          <button type="button" className="link-btn" onClick={() => setTarget(null)}>
            Changer
          </button>
        </InfoBox>
      )}
      {!target && results.length > 0 && (
        <fieldset className="fieldset">
          <legend>Résultats</legend>
          <div style={{ display: 'grid', gap: 6 }}>
            {results.map((x) => (
              <label key={x.id} className="choice" style={{ justifyContent: 'flex-start' }}>
                <input type="radio" name="dup" onChange={() => setTarget({ id: x.id, reference: x.reference })} />
                <span>
                  <strong>{x.reference}</strong> · {x.subject}
                  <span className="cell-sub">{x.customer_name}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!target && dq.length >= 3 && !search.isFetching && results.length === 0 && <p className="caption">Aucun dossier trouvé.</p>}
    </ActionModal>
  );
}
