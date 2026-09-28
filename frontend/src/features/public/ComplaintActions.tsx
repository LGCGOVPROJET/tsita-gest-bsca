import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { RotateCcw, Send, Upload } from 'lucide-react';
import { toApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { InfoBox } from '@/components/ui/InfoBox';
import { FileDrop } from '@/components/ui/FileDrop';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast-context';

/** Opérations client sur un dossier : suivi public (référence + code) ou espace client connecté. */
export interface ComplaintOps {
  sendMessage: (body: string) => Promise<unknown>;
  upload: (file: File) => Promise<unknown>;
  reopen: (reason: string) => Promise<{ reference?: string; tracking_code?: string } | undefined>;
  refresh: () => Promise<unknown>;
  /** Lien vers le dossier enfant créé par une réouverture (espace client connecté). */
  linkFor?: (reference: string) => string;
}

export function MessageForm({ ops }: { ops: ComplaintOps }) {
  const [body, setBody] = useState('');
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => ops.sendMessage(body.trim()),
    onSuccess: async () => {
      setBody('');
      toast.success('Message envoyé à nos équipes.');
      await ops.refresh();
    },
  });
  return (
    <form
      style={{ marginTop: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim().length >= 2) m.mutate();
      }}
    >
      {m.isError && <InfoBox tone="danger" role="alert">{toApiError(m.error).message}</InfoBox>}
      <Textarea label="Écrire un message" rows={3} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} hint="N'indiquez jamais votre code secret ni vos mots de passe." />
      <div className="form-actions">
        <Button type="submit" loading={m.isPending} disabled={body.trim().length < 2} icon={<Send size={15} aria-hidden="true" />}>
          Envoyer
        </Button>
      </div>
    </form>
  );
}

export function UploadForm({ ops }: { ops: ComplaintOps }) {
  const [files, setFiles] = useState<File[]>([]);
  const toast = useToast();
  const m = useMutation({
    mutationFn: async () => {
      for (const f of files) await ops.upload(f);
    },
    onSuccess: async () => {
      toast.success(files.length > 1 ? 'Documents transmis.' : 'Document transmis.');
      setFiles([]);
      await ops.refresh();
    },
  });
  return (
    <form
      style={{ marginTop: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (files.length) m.mutate();
      }}
    >
      <h3>Ajouter un document</h3>
      {m.isError && <InfoBox tone="danger" role="alert">{toApiError(m.error).fieldErrors.file ?? toApiError(m.error).message}</InfoBox>}
      <FileDrop files={files} onChange={setFiles} maxFiles={5} label="Ajouter un document" />
      <div className="form-actions">
        <Button type="submit" loading={m.isPending} disabled={!files.length} icon={<Upload size={15} aria-hidden="true" />}>
          Transmettre de façon sécurisée
        </Button>
      </div>
    </form>
  );
}

/** Toujours monté : après réouverture, `can_reopen` devient faux mais la fenêtre (nouveau code) doit rester affichée. */
export function ReopenAction({ ops, canReopen }: { ops: ComplaintOps; canReopen: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const [result, setResult] = useState<{ reference?: string; tracking_code?: string } | null>(null);
  const m = useMutation({
    mutationFn: () => ops.reopen(reason.trim()),
    onSuccess: async (r) => {
      setResult(r ?? {});
      await ops.refresh();
    },
  });
  return (
    <>
      {canReopen && (
        <div className="row" style={{ marginTop: 12 }}>
          <Button variant="alt" icon={<RotateCcw size={15} aria-hidden="true" />} onClick={() => setOpen(true)}>
            Contester la réponse / demander une réouverture
          </Button>
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Demander une réouverture"
        description="Expliquez pourquoi la réponse ne vous satisfait pas ou quel élément nouveau vous apportez. Votre demande initiale et sa réponse restent consultables."
      >
        {result ? (
          <>
            <InfoBox tone="success" role="status">
              Votre demande de réouverture est enregistrée{result.reference ? ` sous la référence ${result.reference}` : ''}. La demande
              initiale et sa réponse restent consultables.
            </InfoBox>
            {result.reference && ops.linkFor && (
              <p>
                <Link to={ops.linkFor(result.reference)}>Consulter la nouvelle demande</Link>
              </p>
            )}
            {result.tracking_code && (
              <div className="secret-box accent" style={{ marginBottom: 12 }}>
                <div>
                  <div className="secret-label">Nouveau code de suivi (affiché une seule fois)</div>
                  <div className="secret-value">{result.tracking_code}</div>
                </div>
              </div>
            )}
            <div className="form-actions" style={{ paddingBottom: 14 }}>
              <Button onClick={() => setOpen(false)}>Fermer</Button>
            </div>
          </>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length < 20) {
                setErr('Motivez votre demande (20 caractères minimum).');
                return;
              }
              setErr(undefined);
              m.mutate();
            }}
          >
            {m.isError && <InfoBox tone="danger" role="alert">{toApiError(m.error).message}</InfoBox>}
            <Textarea label="Motif de la réouverture" required rows={5} value={reason} onChange={(e) => setReason(e.target.value)} error={err ?? (m.isError ? toApiError(m.error).fieldErrors.reason : undefined)} />
            <div className="form-actions" style={{ paddingBottom: 14 }}>
              <Button variant="alt" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={m.isPending}>
                Envoyer la demande
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
