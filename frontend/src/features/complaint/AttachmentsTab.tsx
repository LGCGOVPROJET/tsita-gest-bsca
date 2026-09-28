import { useState } from 'react';
import { Clock, Download, Eye, FileText, Lock, ShieldAlert, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { complaintsApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { actorName, formatBytes, formatDateTime, itemDate } from '@/lib/format';
import { CLASSIFICATION_LABELS, SCAN_LABELS, VISIBILITY_LABELS } from '@/lib/labels';
import { Badge, InternalBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { FileDrop } from '@/components/ui/FileDrop';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoBox } from '@/components/ui/InfoBox';
import { useToast } from '@/components/ui/toast-context';
import type { Attachment, ComplaintDetail } from '@/types/api';
import { useCaseMutation } from './useCaseMutation';

function attName(a: Attachment): string {
  return a.name ?? a.original_name ?? 'pièce';
}

export function AttachmentsTab({ c, canUpload }: { c: ComplaintDetail; canUpload: boolean }) {
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [classification, setClassification] = useState('interne');
  const [visibility, setVisibility] = useState('internal');
  const [downloading, setDownloading] = useState<number | null>(null);
  const upload = useCaseMutation(
    c.id,
    async () => {
      for (const f of files) await complaintsApi.addAttachment(c.id, f, classification, visibility);
    },
    files.length > 1 ? `${files.length} pièces ajoutées.` : 'Pièce ajoutée.',
  );

  const download = async (a: Attachment) => {
    setDownloading(a.id);
    try {
      await complaintsApi.downloadAttachment(a.id, attName(a));
    } catch (e) {
      toast.error(toApiError(e).message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      {c.attachments.length === 0 ? (
        <EmptyState icon={FileText} title="Aucune pièce" description="Les justificatifs du client et les pièces internes apparaîtront ici." />
      ) : (
        <ul className="file-list" aria-label="Pièces du dossier">
          {c.attachments.map((a) => (
            <li key={a.id} className={`file-item ${a.visibility === 'internal' ? 'internal' : ''}`} style={{ flexWrap: 'wrap' }}>
              {a.visibility === 'internal' ? <Lock size={18} color="var(--warn)" aria-hidden="true" /> : <FileText size={18} color="var(--blue)" aria-hidden="true" />}
              <span className="fname" style={{ minWidth: 160 }}>
                {attName(a)}
                <span className="cell-sub">
                  {formatBytes(a.size)} · {formatDateTime(itemDate(a))} · {a.uploaded_by_client ? 'Déposée par le client' : actorName(a.uploaded_by, 'BSCA')}
                </span>
              </span>
              <span className="badge-row">
                <Badge tone={a.classification === 'confidentiel' ? 'danger' : a.classification === 'interne' ? 'warn' : 'info'} icon={a.classification === 'client' ? FileText : ShieldAlert}>
                  {a.classification_label ?? CLASSIFICATION_LABELS[a.classification] ?? a.classification}
                </Badge>
                {a.visibility === 'internal' ? (
                  <InternalBadge>{VISIBILITY_LABELS[a.visibility] ?? 'Interne'}</InternalBadge>
                ) : (
                  <Badge tone="info" icon={Eye}>
                    {VISIBILITY_LABELS[a.visibility] ?? a.visibility}
                  </Badge>
                )}
                <Badge tone={a.scan_status === 'sain' ? 'success' : a.scan_status === 'rejete' ? 'danger' : 'warn'} icon={a.scan_status === 'sain' ? ShieldCheck : a.scan_status === 'rejete' ? XCircle : Clock}>{SCAN_LABELS[a.scan_status] ?? a.scan_status}</Badge>
              </span>
              <Button
                size="sm"
                variant="alt"
                onClick={() => download(a)}
                loading={downloading === a.id}
                disabled={a.can_download === false || a.scan_status === 'rejete' || (a.can_download === undefined && a.scan_status !== 'sain')}
                icon={<Download size={14} aria-hidden="true" />}
                aria-label={`Télécharger ${attName(a)}`}
                title={a.scan_status === 'en_attente' ? "Analyse antivirus en cours" : a.can_download === false ? 'Téléchargement non autorisé pour votre profil' : undefined}
              >
                Télécharger
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="caption" style={{ marginTop: 10 }}>
        Chaque téléchargement est contrôlé et journalisé. Les pièces internes et confidentielles ne sont jamais publiées dans le suivi client.
      </p>

      {canUpload && (
        <form
          className="card flat spacing"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!files.length) return;
            await upload
              .mutateAsync(undefined)
              .then(() => setFiles([]))
              .catch(() => undefined);
          }}
        >
          <h3>Ajouter des pièces</h3>
          {upload.apiError && <InfoBox tone="danger">{upload.apiError.fieldErrors.file ?? upload.apiError.message}</InfoBox>}
          <FileDrop files={files} onChange={setFiles} />
          <div className="formgrid">
            <Select label="Classification" options={Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => ({ value, label }))} value={classification} onChange={(e) => {
              setClassification(e.target.value);
              if (e.target.value !== 'client') setVisibility('internal');
            }} />
            <Select
              label="Visibilité"
              options={Object.entries(VISIBILITY_LABELS).map(([value, label]) => ({ value, label }))}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              hint={classification !== 'client' ? 'Les pièces internes ou confidentielles restent internes.' : undefined}
              disabled={classification !== 'client'}
            />
          </div>
          <div className="form-actions">
            <Button type="submit" loading={upload.isPending} disabled={!files.length} icon={<Upload size={15} aria-hidden="true" />}>
              Téléverser
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
