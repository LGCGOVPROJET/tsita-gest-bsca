import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { InfoBox } from '@/components/ui/InfoBox';
import type { ApiError } from '@/api/client';

interface ActionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  /** Si défini, un motif est obligatoire et transmis à onSubmit. */
  requireReason?: boolean;
  reasonLabel?: string;
  onSubmit: (reason: string) => Promise<unknown> | void;
  pending?: boolean;
  error?: ApiError | null;
  children?: ReactNode;
  wide?: boolean;
  submitVariant?: 'primary' | 'blue' | 'success' | 'danger-outline';
  canSubmit?: boolean;
  /** Résumé de l'effet (« Le client verra : … », échéance maintenue…), affiché avant les boutons. */
  effect?: ReactNode[];
  /**
   * Étape de confirmation pour les actions irréversibles (envoi au client, validation N2).
   * Le premier clic affiche le récapitulatif ; le second exécute l'action.
   */
  confirm?: { title: string; body: ReactNode; confirmLabel: string };
}

/** Modale d'action métier avec motif obligatoire (tracé dans la chronologie et l'audit). */
export function ActionModal({
  open,
  onClose,
  title,
  description,
  submitLabel,
  requireReason = true,
  reasonLabel = 'Motif',
  onSubmit,
  pending,
  error,
  children,
  wide,
  submitVariant = 'primary',
  canSubmit = true,
  effect,
  confirm,
}: ActionModalProps) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    setConfirming(false);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (requireReason && reason.trim().length < 5) {
      setReasonError('Le motif est obligatoire (5 caractères minimum).');
      return;
    }
    setReasonError(undefined);
    if (confirm && !confirming) {
      setConfirming(true);
      return;
    }
    try {
      await onSubmit(reason.trim());
      setReason('');
      close();
    } catch {
      /* l'erreur est affichée via `error` */
      setConfirming(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={title} description={description} wide={wide}>
      <form onSubmit={submit} noValidate>
        <div role="alert">
          {error && (
            <InfoBox tone="danger">
              {error.message}
              {Object.keys(error.fieldErrors).length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {Object.entries(error.fieldErrors).map(([k, m]) => (
                    <li key={k}>{m}</li>
                  ))}
                </ul>
              )}
            </InfoBox>
          )}
        </div>
        {children}
        {requireReason && (
          <Textarea
            label={reasonLabel}
            required
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setConfirming(false);
            }}
            hint="Le motif est enregistré dans la chronologie et le journal d'audit."
            error={reasonError ?? error?.fieldErrors.reason}
          />
        )}
        {effect && effect.length > 0 && (
          <section className="effect-summary" aria-label="Effet de l'action">
            <h3>Ce qui va se passer</h3>
            <ul>
              {effect.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </section>
        )}
        {confirm && confirming && (
          <div className="confirm-step" role="alert">
            <h3>
              <AlertTriangle size={17} aria-hidden="true" /> {confirm.title}
            </h3>
            <div>{confirm.body}</div>
          </div>
        )}
        <div className="form-actions" style={{ paddingBottom: 14 }}>
          <Button variant="alt" onClick={confirming ? () => setConfirming(false) : close}>
            {confirming ? 'Revenir' : 'Annuler'}
          </Button>
          <Button type="submit" variant={submitVariant} loading={pending} disabled={!canSubmit}>
            {confirm && confirming ? confirm.confirmLabel : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
