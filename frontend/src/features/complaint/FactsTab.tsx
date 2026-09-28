import { useState } from 'react';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import { complaintsApi } from '@/api/endpoints';
import { useReferentials } from '@/hooks/useReferentials';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { ACK_LABELS, RISK_LABELS, TASK_STATUS_LABELS, labelOf } from '@/lib/labels';
import { Stat, StatList } from '@/components/ui/Stat';
import { Badge, PriorityBadge } from '@/components/ui/Badge';
import { InfoBox } from '@/components/ui/InfoBox';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import type { ComplaintDetail } from '@/types/api';
import { useCaseMutation } from './useCaseMutation';

export function FactsTab({ c }: { c: ComplaintDetail }) {
  return (
    <div>
      <h3>Faits exposés</h3>
      <p className="facts-desc">{c.description}</p>
      {c.amount_flagged && (
        <InfoBox tone="warn">Montant signalé comme hors norme : vérifiez la saisie et le seuil d'approbation N2.</InfoBox>
      )}
      <div className="grid equal" style={{ marginTop: 0 }}>
        <div>
          <h3>Qualification</h3>
          <StatList label="Qualification">
            <Stat label="Catégorie">{c.category?.label ?? 'À qualifier'}</Stat>
            <Stat label="Produit">{c.product?.label ?? 'Non précisé'}</Stat>
            <Stat label="Montant">{formatMoney(c.amount, c.currency)}</Stat>
            <Stat label="Priorité">
              <PriorityBadge priority={c.priority} />
            </Stat>
            <Stat label="Risque">{labelOf(RISK_LABELS, c.risk_level, 'Non évalué')}</Stat>
          </StatList>
        </div>
        <div>
          <h3>Client</h3>
          <StatList label="Client">
            <Stat label="Nom">{c.customer?.full_name ?? c.customer_name}</Stat>
            <Stat label="E-mail">{c.customer?.email ?? '—'}</Stat>
            <Stat label="Téléphone">{c.customer?.phone ?? '—'}</Stat>
            <Stat label="Accusé de réception">
              {c.acknowledgment_status === 'echec' ? (
                <Badge tone="danger">{ACK_LABELS.echec}</Badge>
              ) : c.acknowledged_at ? (
                formatDateTime(c.acknowledged_at)
              ) : (
                labelOf(ACK_LABELS, c.acknowledgment_status)
              )}
            </Stat>
            <Stat label="Réponse finale">{formatDateTime(c.final_response_at, 'Non envoyée')}</Stat>
          </StatList>
        </div>
      </div>
      {c.source && (
        <InfoBox tone="info">
          Dossier repris de l'existant : système <strong>{c.source.system}</strong>, identifiant {c.source.id}
          {c.source.status_label ? `, statut source « ${c.source.status_label} »` : ''}.
        </InfoBox>
      )}
      <TasksBlock c={c} />
    </div>
  );
}

function TasksBlock({ c }: { c: ComplaintDetail }) {
  const ref = useReferentials();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const canEdit = c.can.manage_tasks ?? (c.can.transition || c.can.assign);
  const add = useCaseMutation(
    c.id,
    () => complaintsApi.addTask(c.id, { title: title.trim(), assignee_id: assignee ? Number(assignee) : null, due_at: due || null }),
    'Tâche ajoutée.',
  );
  const toggle = useCaseMutation(c.id, (p: { id: number; status: string }) => complaintsApi.updateTask(p.id, { status: p.status }), 'Tâche mise à jour.');

  return (
    <section style={{ marginTop: 18 }} aria-label="Tâches">
      <div className="card-head">
        <h3>Tâches</h3>
        {canEdit && !adding && (
          <Button size="sm" variant="alt" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Ajouter une tâche
          </Button>
        )}
      </div>
      {c.tasks.length === 0 && !adding && <p className="caption">Aucune tâche pour ce dossier.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {c.tasks.map((t) => {
          const done = t.status === 'terminee';
          return (
            <li key={t.id} className={`task-row ${done ? 'done' : ''}`}>
              {canEdit ? (
                <button
                  type="button"
                  className="btn text sm"
                  aria-label={done ? `Rouvrir la tâche « ${t.title} »` : `Marquer « ${t.title} » comme terminée`}
                  onClick={() => toggle.mutate({ id: t.id, status: done ? 'a_faire' : 'terminee' })}
                  disabled={toggle.isPending}
                >
                  {done ? <CheckCircle2 size={18} color="var(--success)" aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                </button>
              ) : done ? (
                <CheckCircle2 size={18} color="var(--success)" aria-hidden="true" />
              ) : (
                <Circle size={18} aria-hidden="true" />
              )}
              <span className="task-title">{t.title}</span>
              <span className="caption">{t.assignee?.name ?? 'Non assignée'}</span>
              <span className="caption">{t.due_at ? `Échéance ${formatDate(t.due_at)}` : ''}</span>
              <Badge tone={done ? 'success' : t.status === 'en_cours' ? 'warn' : 'neutral'}>{TASK_STATUS_LABELS[t.status] ?? t.status}</Badge>
            </li>
          );
        })}
      </ul>
      {adding && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (title.trim().length < 3) return;
            try {
              await add.mutateAsync(undefined);
              setTitle('');
              setAssignee('');
              setDue('');
              setAdding(false);
            } catch {
              /* erreur affichée */
            }
          }}
          className="card flat"
          style={{ marginTop: 10 }}
        >
          {add.apiError && <InfoBox tone="danger">{add.apiError.message}</InfoBox>}
          <div className="formgrid three">
            <Input label="Intitulé" required value={title} onChange={(e) => setTitle(e.target.value)} error={add.apiError?.fieldErrors.title} />
            <Select
              label="Assignée à"
              placeholder="Non assignée"
              hint="Collaborateurs actifs uniquement (ni client ni administrateur)."
              options={(ref.data?.users ?? []).filter((u) => !['admin', 'client', 'direction'].includes(u.role)).map((u) => ({ value: u.id, label: u.name }))}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              error={add.apiError?.fieldErrors.assignee_id}
            />
            <Input label="Échéance" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="form-actions">
            <Button variant="alt" onClick={() => setAdding(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={add.isPending} disabled={title.trim().length < 3}>
              Ajouter
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
