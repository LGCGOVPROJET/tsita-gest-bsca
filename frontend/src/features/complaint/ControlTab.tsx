import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { complaintsApi } from '@/api/endpoints';
import { actorName, formatDateTime } from '@/lib/format';
import { CONTROL_LABELS } from '@/lib/labels';
import { ControlBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoBox } from '@/components/ui/InfoBox';
import { Timeline } from '@/components/ui/Timeline';
import type { ComplaintDetail, ControlResult } from '@/types/api';
import { useCaseMutation } from './useCaseMutation';

export function ControlTab({ c, canControl }: { c: ComplaintDetail; canControl: boolean }) {
  const [result, setResult] = useState<ControlResult>('conforme');
  const [findings, setFindings] = useState('');
  const m = useCaseMutation(c.id, () => complaintsApi.addControl(c.id, { result, findings: findings.trim() }), 'Contrôle qualité enregistré.');

  return (
    <div>
      {c.controls.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Aucun contrôle qualité" description="Les contrôles de la réponse et du traitement apparaîtront ici." />
      ) : (
        <Timeline
          label="Contrôles qualité"
          items={[...c.controls]
            .sort((a, b) => b.controlled_at.localeCompare(a.controlled_at))
            .map((q) => ({
              key: q.id,
              title: <ControlBadge result={q.result} />,
              meta: `${formatDateTime(q.controlled_at)} · ${actorName(q.controller)}`,
              body: q.findings ? <span className="pre-wrap">{q.findings}</span> : 'Sans constat particulier.',
            }))}
        />
      )}
      <InfoBox tone="info">Les avis de contrôle ne sont jamais visibles par le client.</InfoBox>
      {canControl && (
        <form
          className="card flat"
          onSubmit={async (e) => {
            e.preventDefault();
            await m
              .mutateAsync(undefined)
              .then(() => setFindings(''))
              .catch(() => undefined);
          }}
        >
          <h3>Nouveau contrôle</h3>
          {m.apiError && <InfoBox tone="danger">{m.apiError.message}</InfoBox>}
          <fieldset className="fieldset">
            <legend>Résultat</legend>
            <div className="choice-row">
              {(Object.keys(CONTROL_LABELS) as ControlResult[]).map((k) => (
                <label key={k} className="choice">
                  <input type="radio" name="ctrl" checked={result === k} onChange={() => setResult(k)} />
                  {CONTROL_LABELS[k]}
                </label>
              ))}
            </div>
          </fieldset>
          <Textarea label="Constats" rows={3} required={result !== 'conforme'} value={findings} onChange={(e) => setFindings(e.target.value)} hint={result !== 'conforme' ? 'Décrivez les écarts constatés.' : undefined} error={m.apiError?.fieldErrors.findings} />
          <div className="form-actions">
            <Button type="submit" loading={m.isPending} disabled={result !== 'conforme' && findings.trim().length < 5}>
              Enregistrer le contrôle
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
