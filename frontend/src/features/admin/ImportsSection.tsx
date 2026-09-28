import { useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { actorName, formatBytes, formatDateTime, formatNumber } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { InfoBox } from '@/components/ui/InfoBox';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import type { ImportBatch } from '@/types/api';

const RESOLUTION: Record<string, { label: string; tone: 'warn' | 'success' | 'neutral' }> = {
  a_traiter: { label: 'À traiter', tone: 'warn' },
  resolu: { label: 'Résolu', tone: 'success' },
  ignore: { label: 'Ignoré', tone: 'neutral' },
};

export function ImportsSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = useQuery({ queryKey: ['admin', 'imports', page], queryFn: () => adminApi.imports({ page: String(page) }), placeholderData: keepPreviousData });
  const upload = useMutation({
    mutationFn: () => adminApi.uploadImport(file!, source.trim()),
    onSuccess: async ({ batch: b, alreadyImported, message }) => {
      if (alreadyImported) {
        toast.warn(message ?? 'Ce fichier a déjà été importé : aucun dossier créé.');
        setDuplicateOf(b?.id ?? null);
      } else {
        setDuplicateOf(null);
        toast.success(b ? `Import traité : ${b.rows_created} créés, ${b.rows_skipped} ignorés, ${b.rows_anomalies} anomalies.` : 'Import traité.');
      }
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      await qc.invalidateQueries({ queryKey: ['admin', 'imports'] });
      if (b?.id) setDetail(b.id);
    },
  });
  const err = upload.isError ? toApiError(upload.error) : null;

  return (
    <section aria-label="Imports historiques">
      <div className="card-head">
        <div>
          <h2>Imports historiques</h2>
          <span className="caption">Reprise de l'existant par fichier CSV. Idempotent : un même fichier importé deux fois ne crée pas de doublons.</span>
        </div>
      </div>
      <form
        className="card flat"
        onSubmit={(e) => {
          e.preventDefault();
          let bad = false;
          if (!file) {
            setFileError('Choisissez un fichier CSV.');
            bad = true;
          }
          if (!source.trim()) {
            setSourceError('Indiquez le système source (ex. REGISTRE-EXCEL).');
            bad = true;
          }
          if (bad) return;
          upload.mutate();
        }}
      >
        {err && (
          <InfoBox tone={err.status === 409 ? 'warn' : 'danger'} role="alert">
            {err.status === 409 ? 'Ce fichier a déjà été importé (empreinte identique) : aucun dossier créé.' : err.fieldErrors.file ?? err.message}
          </InfoBox>
        )}
        <div className="formgrid">
          <div className="field">
            <label className="label-text" htmlFor="import-file">
              Fichier CSV<span className="req" aria-hidden="true"> *</span>
            </label>
            <input
              ref={inputRef}
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              aria-describedby="import-hint"
              aria-invalid={Boolean(fileError) || undefined}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFileError(null);
                if (f && !/\.csv$/i.test(f.name)) {
                  setFileError('Format attendu : CSV.');
                  setFile(null);
                  return;
                }
                setFile(f);
              }}
            />
            <span id="import-hint" className="hint">
              {file ? `${file.name} · ${formatBytes(file.size)}` : 'Encodage UTF-8, séparateur « ; » ou « , ».'}
            </span>
            {fileError && <span className="error">{fileError}</span>}
          </div>
          <Input
            label="Système source"
            required
            placeholder="ex. OUTIL-RECLAMATIONS-V1"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setSourceError(null);
            }}
            hint="Conservé avec chaque dossier importé."
            error={sourceError ?? err?.fieldErrors.source_system}
          />
        </div>
        <div className="form-actions">
          <Button type="submit" loading={upload.isPending} icon={<Upload size={15} aria-hidden="true" />}>
            Importer
          </Button>
        </div>
      </form>

      <h3 style={{ marginTop: 18 }}>Historique des imports</h3>
      {list.isPending ? (
        <SkeletonRows rows={4} cols={5} />
      ) : list.isError ? (
        <ErrorState message={toApiError(list.error).message} onRetry={() => list.refetch()} />
      ) : list.data.data.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="Aucun import" />
      ) : (
        <>
          <ResponsiveTable<ImportBatch>
            caption="Historique des imports"
            rows={list.data.data}
            rowKey={(b) => b.id}
            mobileTitle={(b) => b.filename}
            columns={[
              { key: 'file', header: 'Fichier', hideOnMobile: true, render: (b) => <>{b.filename}<span className="cell-sub">{b.source_system}</span></> },
              { key: 'date', header: 'Date', render: (b) => <>{formatDateTime(b.created_at)}<span className="cell-sub">{actorName(b.imported_by)}</span></> },
              { key: 'status', header: 'Statut', render: (b) => <Badge tone={b.rows_anomalies ? 'warn' : 'success'}>{b.status}</Badge> },
              {
                key: 'counts',
                header: 'Lignes',
                render: (b) => `${formatNumber(b.rows_total)} lues · ${formatNumber(b.rows_created)} créées · ${formatNumber(b.rows_skipped)} ignorées`,
              },
              { key: 'anom', header: 'Anomalies', render: (b) => <span style={{ fontWeight: 800, color: b.rows_anomalies ? 'var(--warn-ink)' : undefined }}>{formatNumber(b.rows_anomalies)}</span> },
              { key: 'open', header: 'Rapport', render: (b) => <Button size="sm" variant="alt" onClick={() => setDetail(b.id)}>Voir le rapport</Button> },
            ]}
          />
          <Pagination meta={list.data.meta} onPage={setPage} />
        </>
      )}
      {detail !== null && <ImportDetail id={detail} alreadyImported={duplicateOf === detail} onClose={() => { setDetail(null); setDuplicateOf(null); }} />}
    </section>
  );
}

function ImportDetail({ id, onClose, alreadyImported = false }: { id: number; onClose: () => void; alreadyImported?: boolean }) {
  const q = useQuery({ queryKey: ['admin', 'imports', 'detail', id], queryFn: () => adminApi.importDetail(id) });
  const b = q.data;
  return (
    <Modal open onClose={onClose} wide title="Rapport d'import" description={b ? `${b.filename} · ${formatDateTime(b.created_at)}` : undefined}>
      {q.isError ? (
        <ErrorState message={toApiError(q.error).message} />
      ) : !b ? (
        <SkeletonRows rows={4} cols={4} />
      ) : (
        <>
          <div className="recon" aria-label="Synthèse de l'import">
            <div className="recon-term"><span>Lignes lues</span><b>{formatNumber(b.rows_total)}</b></div>
            <div className="recon-term"><span>Créées</span><b>{formatNumber(b.rows_created)}</b></div>
            <div className="recon-term"><span>Ignorées (déjà présentes)</span><b>{formatNumber(b.rows_skipped)}</b></div>
            <div className="recon-term result"><span>Anomalies</span><b>{formatNumber(b.rows_anomalies)}</b></div>
          </div>
          {alreadyImported && (
            <InfoBox tone="warn" role="status">
              Ce fichier avait déjà été importé (empreinte SHA-256 identique) : aucun dossier n'a été créé. Rapport du lot d'origine ci-dessous.
            </InfoBox>
          )}
          {b.rows_created + b.rows_skipped + b.rows_anomalies > b.rows_total && (
            <p className="caption">Une ligne peut être créée tout en portant une anomalie à traiter : les anomalies ne s'ajoutent donc pas aux lignes créées.</p>
          )}
          {b.rows_created + b.rows_skipped + b.rows_anomalies < b.rows_total && (
            <InfoBox tone="warn">Certaines lignes lues ne sont ni créées, ni ignorées, ni en anomalie : vérifiez le rapport.</InfoBox>
          )}
          {(b.anomalies ?? []).length === 0 ? (
            <InfoBox tone="success">Aucune anomalie : toutes les lignes ont été interprétées.</InfoBox>
          ) : (
            <div className="tablewrap" style={{ marginBottom: 16 }}>
              <table className="table stack-sm">
                <caption className="sr-only">Anomalies de l'import</caption>
                <thead>
                  <tr>
                    <th scope="col">Ligne</th>
                    <th scope="col">Identifiant source</th>
                    <th scope="col">Anomalie</th>
                    <th scope="col">Résolution</th>
                  </tr>
                </thead>
                <tbody>
                  {(b.anomalies ?? []).map((a) => (
                    <tr key={a.id}>
                      <td className="num" data-label="Ligne">{a.row_number}</td>
                      <td data-label="Identifiant source">{a.source_id ?? '—'}</td>
                      <td data-label="Anomalie">{a.issue}</td>
                      <td data-label="Résolution">
                        <Badge tone={RESOLUTION[a.resolution_status]?.tone ?? 'neutral'}>{RESOLUTION[a.resolution_status]?.label ?? a.resolution_status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
