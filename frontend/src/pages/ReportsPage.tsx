import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, ShieldCheck, XCircle } from 'lucide-react';
import { reportsApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useReferentials } from '@/hooks/useReferentials';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { addDays, formatDate, formatDateTime, formatNumber, monthStart, todayLocal } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { FilterBar } from '@/features/filters/FilterBar';
import { Tabs } from '@/components/ui/Tabs';
import { tabPanelProps } from '@/components/ui/tabPanel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { InfoBox } from '@/components/ui/InfoBox';
import { InfoTip } from '@/components/ui/Tooltip';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Field';
import { Stat, StatList } from '@/components/ui/Stat';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import type { ActivityReport, BreakdownRow, ExportFormat } from '@/types/api';

const KEYS = ['from', 'to', 'as_of', 'agency_id', 'entity_id', 'category_id', 'channel'] as const;
type Breakdown = 'by_month' | 'by_agency' | 'by_entity' | 'by_channel' | 'by_category' | 'by_decision';

const BREAKDOWNS: { key: Breakdown; label: string }[] = [
  { key: 'by_month', label: 'Mois' },
  { key: 'by_agency', label: 'Agence de réception' },
  { key: 'by_entity', label: 'Entité de traitement' },
  { key: 'by_channel', label: 'Canal' },
  { key: 'by_category', label: 'Catégorie' },
  { key: 'by_decision', label: 'Décision' },
];

const COLUMN_LABELS: Record<string, string> = {
  label: 'Libellé',
  month: 'Mois',
  count: 'Nombre',
  received: 'Reçues',
  inflow: 'Entrées',
  responded: 'Réponses',
  outflow: 'Réponses finales',
  stock: 'Stock',
  late_open: 'Retard ouvert',
  late_closed: 'Retard clos',
  late: 'En retard',
  rate: 'Taux',
  treatment_rate: 'Taux de traitement',
  reopened: 'Réouvertes',
  opening_stock: 'Stock début',
  closing_stock: 'Stock fin',
  adjustments: 'Ajustements',
  balanced: 'Équilibré',
};

const HIDDEN_KEYS = new Set(['id', 'from', 'to', 'decision']);
const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Africa/Brazzaville' });

function cellText(k: string, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '✓ Oui' : '✗ Non';
  if (k === 'month' && typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) {
    const s = monthFmt.format(new Date(`${v}-15T12:00:00+01:00`));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (typeof v === 'number') return formatNumber(v);
  return String(v);
}

function adjustmentsTotal(a: ActivityReport['adjustments']): number {
  if (typeof a === 'number') return a;
  return (a ?? []).reduce((s, x) => s + (Number(x.count) || 0), 0);
}

export default function ReportsPage() {
  useDocumentTitle('Rapports');
  const { user } = useAuth();
  const toast = useToast();
  const ref = useReferentials();
  const today = todayLocal();
  const defaults = useMemo(() => ({ from: monthStart(today, 0), to: today, as_of: today }), [today]);
  const { values, set, reset, activeCount } = useUrlFilters(KEYS, defaults);
  const [tab, setTab] = useState<Breakdown>('by_month');
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [validating, setValidating] = useState(false);
  const anonymized = !can(user, 'complaints.export');

  const q = useQuery({
    queryKey: ['report-activity', values],
    queryFn: () => reportsApi.activity(values),
    placeholderData: keepPreviousData,
  });
  const r = q.data;

  const doExport = async (f: ExportFormat) => {
    setExporting(f);
    try {
      await reportsApi.exportFile(values, f);
      toast.success(`Rapport ${f.toUpperCase()} généré${anonymized ? ' (agrégé et anonymisé)' : ''}. L'export est journalisé avec ses filtres.`);
    } catch (e) {
      toast.error(toApiError(e).message);
    } finally {
      setExporting(null);
    }
  };

  const activeFilterLabels = [
    values.agency_id && `agence : ${ref.data?.agencies.find((a) => String(a.id) === values.agency_id)?.name ?? values.agency_id}`,
    values.entity_id && `entité : ${ref.data?.entities.find((a) => String(a.id) === values.entity_id)?.name ?? values.entity_id}`,
    values.category_id && `catégorie : ${ref.data?.categories.find((a) => String(a.id) === values.category_id)?.label ?? values.category_id}`,
    values.channel && `canal : ${ref.data?.channels.find((a) => a.code === values.channel)?.label ?? values.channel}`,
  ].filter(Boolean) as string[];

  const adj = r ? adjustmentsTotal(r.adjustments) : 0;
  const computed = r ? r.opening_stock + r.inflow - r.outflow + adj : 0;

  return (
    <>
      <PageHeader
        eyebrow="Pilotage et contrôle"
        title="Rapports"
        sub="Des chiffres rapprochés et des définitions conservées avec chaque export."
        actions={
          <div className="row" role="group" aria-label="Exporter ou valider le rapport">
            {can(user, 'reports.validate') && (
              <Button variant="success" icon={<ShieldCheck size={15} aria-hidden="true" />} disabled={!r} onClick={() => setValidating(true)}>
                {r?.validated_at ? 'Revalider le rapport' : 'Valider le rapport'}
              </Button>
            )}
            {(['pdf', 'xlsx', 'csv'] as ExportFormat[]).map((f) => (
              <Button
                key={f}
                variant={f === 'pdf' ? 'primary' : 'alt'}
                loading={exporting === f}
                disabled={exporting !== null || !r}
                onClick={() => doExport(f)}
                icon={<Download size={15} aria-hidden="true" />}
                aria-label={`Exporter le rapport d'activité au format ${f.toUpperCase()}`}
              >
                {f.toUpperCase()}
              </Button>
            ))}
          </div>
        }
      />

      <FilterBar
        label="Filtres du rapport"
        fields={['from', 'to', 'as_of', 'agency_id', 'entity_id', 'category_id', 'channel']}
        values={values}
        onChange={(k, v) => set(k as (typeof KEYS)[number], v)}
        onReset={activeCount ? reset : undefined}
        note={`Période du ${formatDate(values.from)} au ${formatDate(values.to)} · calcul au ${formatDate(values.as_of)}.`}
      />

      {r?.meta.rule_is_demo && (
        <InfoBox tone="warn" role="note">
          Règle de démonstration — non validée par la conformité BSCA. Les retards de ce rapport sont indicatifs.
        </InfoBox>
      )}

      {q.isError && !r ? (
        <Card>
          <ErrorState message={toApiError(q.error).message} onRetry={() => q.refetch()} />
        </Card>
      ) : !r ? (
        <div className="grid equal">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      ) : (
        <>
          <div className="grid" style={{ marginTop: 0 }}>
            <Card
              title="Rapport d'activité · réconciliation du stock"
              caption="Stock début + entrées − réponses finales ± ajustements = stock fin"
              actions={
                r.balanced ? (
                  <Badge tone="success" icon={CheckCircle2}>
                    Équilibré
                  </Badge>
                ) : (
                  <Badge tone="danger" icon={XCircle}>
                    Écart à justifier
                  </Badge>
                )
              }
            >
              <div className="recon" role="group" aria-label="Équation de réconciliation du stock">
                <div className="recon-term">
                  <span>Stock au {formatDate(addDays(values.from, -1))}</span>
                  <b>{formatNumber(r.opening_stock)}</b>
                </div>
                <span className="recon-op" aria-label="plus">+</span>
                <div className="recon-term">
                  <span>Entrées</span>
                  <b>{formatNumber(r.inflow)}</b>
                </div>
                <span className="recon-op" aria-label="moins">−</span>
                <div className="recon-term">
                  <span>Réponses finales</span>
                  <b>{formatNumber(r.outflow)}</b>
                </div>
                <span className="recon-op" aria-label="plus ou moins">±</span>
                <div className="recon-term">
                  <span>Ajustements</span>
                  <b>{adj > 0 ? `+${formatNumber(adj)}` : formatNumber(adj)}</b>
                </div>
                <span className="recon-op" aria-label="égal">=</span>
                <div className="recon-term result">
                  <span>Stock au {formatDate(values.to)}</span>
                  <b>{formatNumber(r.closing_stock)}</b>
                </div>
              </div>
              <p className="sr-only">
                {`Stock de début ${r.opening_stock}, plus ${r.inflow} entrées, moins ${r.outflow} réponses finales, ajustements ${adj}, égal ${r.closing_stock}. ${r.balanced ? 'Le rapport est équilibré.' : 'Le rapport présente un écart.'}`}
              </p>
              {r.balanced ? (
                <InfoBox tone="success">Réconciliation vérifiée : le stock final se déduit exactement des flux de la période.</InfoBox>
              ) : (
                <InfoBox tone="danger" role="alert">
                  Écart de {formatNumber(r.closing_stock - computed)} dossier(s) entre le stock calculé ({formatNumber(computed)}) et le stock
                  constaté. Documentez les ajustements avant validation.
                </InfoBox>
              )}
              {Array.isArray(r.adjustments) && r.adjustments.length > 0 && (
                <ul className="caption" style={{ paddingLeft: 18 }}>
                  {r.adjustments.map((a, i) => (
                    <li key={i}>
                      {a.label ?? a.reason ?? 'Ajustement'} : {a.count > 0 ? '+' : ''}
                      {a.count}
                    </li>
                  ))}
                </ul>
              )}
              <StatList>
                <Stat
                  label={
                    <>
                      Retard ouvert <InfoTip label="Définition : retard ouvert">Dossiers ouverts à la date de calcul dont l'échéance finale est dépassée.</InfoTip>
                    </>
                  }
                >
                  {formatNumber(r.late_open)}
                </Stat>
                <Stat
                  label={
                    <>
                      Retard clos <InfoTip label="Définition : retard clos">Dossiers répondus dans la période après leur échéance finale.</InfoTip>
                    </>
                  }
                >
                  {formatNumber(r.late_closed)}
                </Stat>
              </StatList>
            </Card>

            <Card title="Traçabilité de l'export">
              <StatList>
                <Stat label="Période">
                  Du {formatDate(r.meta.from ?? values.from)} au {formatDate(r.meta.to ?? values.to)}
                </Stat>
                <Stat label="Filtres">{activeFilterLabels.length ? activeFilterLabels.join(' · ') : 'Aucun (périmètre complet autorisé)'}</Stat>
                <Stat label="Date de calcul">{formatDate(r.meta.as_of ?? values.as_of)}</Stat>
                <Stat label="Version de règle">{r.meta.rule_version ? String(r.meta.rule_version) : 'Non communiquée'}</Stat>
                <Stat label="Formule">{r.meta.formula ?? 'Stock début + entrées − réponses finales ± ajustements = stock fin'}</Stat>
                <Stat label="Fuseau">{r.meta.timezone ?? 'Africa/Brazzaville'}</Stat>
                <Stat label="Généré par">{r.meta.generated_by ?? user?.name}</Stat>
                <Stat label="Calculé le">{formatDateTime(r.meta.computed_at ?? r.meta.generated_at ?? new Date())}</Stat>
                <Stat label="Validation">
                  {r.validated_at ? (
                    <>
                      <Badge tone="success" icon={ShieldCheck}>
                        Validé
                      </Badge>{' '}
                      par {r.validated_by?.name ?? 'la conformité'} le {formatDateTime(r.validated_at)}
                    </>
                  ) : (
                    <Badge tone="warn">Non validé pour ce périmètre</Badge>
                  )}
                </Stat>
                {r.validation?.comment && <Stat label="Commentaire de validation">{r.validation.comment}</Stat>}
              </StatList>
              {anonymized && (
                <InfoBox tone="info">
                  Votre profil n'a pas le droit d'exporter les dossiers : l'export du rapport est <strong>agrégé et anonymisé</strong> (validateur
                  remplacé par « Conformité (validation n° X) », mention en en-tête). Il est journalisé.
                </InfoBox>
              )}
              <p className="caption" style={{ marginTop: 8 }}>
                Période, filtres, date de calcul, formule, version de règle et utilisateur sont inscrits dans l'en-tête de chaque fichier exporté ;
                l'export est journalisé.
              </p>
            </Card>
          </div>

          <section className="card spacing" aria-label="Ventilations">
            <h2>Ventilations</h2>
            <Tabs<Breakdown> label="Ventilation" idPrefix="rep" tabs={BREAKDOWNS} active={tab} onChange={setTab} />
            <div {...tabPanelProps('rep', tab)}>
              <BreakdownTable rows={(r[tab] as BreakdownRow[] | undefined) ?? []} caption={`Ventilation par ${BREAKDOWNS.find((b) => b.key === tab)?.label.toLowerCase()}`} />
            </div>
          </section>
        </>
      )}
      {validating && r && (
        <ValidateReportModal
          params={{
            from: values.from,
            to: values.to,
            as_of: values.as_of,
            filters: Object.fromEntries(
              (['agency_id', 'entity_id', 'category_id', 'channel'] as const).filter((k) => values[k]).map((k) => [k, k === 'channel' ? values[k] : Number(values[k])]),
            ),
          }}
          summary={`Du ${formatDate(values.from)} au ${formatDate(values.to)} · ${activeFilterLabels.length ? activeFilterLabels.join(' · ') : 'périmètre complet'} · ${r.balanced ? 'réconciliation équilibrée' : 'écart de réconciliation'}`}
          balanced={r.balanced}
          onClose={() => setValidating(false)}
        />
      )}
    </>
  );
}

function BreakdownTable({ rows, caption }: { rows: BreakdownRow[]; caption: string }) {
  if (rows.length === 0) return <EmptyState title="Aucune donnée" description="Aucune ligne pour cette ventilation." />;
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter((k) => !k.endsWith('_id') && !HIDDEN_KEYS.has(k));
  const labelKey = keys.includes('label') ? 'label' : keys.includes('month') ? 'month' : keys[0]!;
  const others = keys.filter((k) => k !== labelKey && !(labelKey === 'label' && k === 'month'));
  const numeric = (k: string) => rows.every((r) => r[k] === null || typeof r[k] === 'number');
  const summable = (k: string) => numeric(k) && !/stock|rate|taux/.test(k);
  const totals = Object.fromEntries(others.filter(summable).map((k) => [k, rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)]));
  return (
    <div className="tablewrap">
      <table className="table stack-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{COLUMN_LABELS[labelKey] ?? labelKey}</th>
            {others.map((k) => (
              <th key={k} scope="col" className={numeric(k) ? 'num' : undefined}>
                {COLUMN_LABELS[k] ?? k.replaceAll('_', ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td data-label={COLUMN_LABELS[labelKey] ?? labelKey}>
                <strong>{cellText(labelKey, r[labelKey])}</strong>
              </td>
              {others.map((k) => (
                <td key={k} className={numeric(k) ? 'num' : undefined} data-label={COLUMN_LABELS[k] ?? k.replaceAll('_', ' ')}>
                  {cellText(k, r[k])}
                </td>
              ))}
            </tr>
          ))}
          {Object.keys(totals).length > 0 && (
            <tr>
              <td>
                <strong>Total</strong>
              </td>
              {others.map((k) => (
                <td key={k} className="num" data-label={COLUMN_LABELS[k] ?? k.replaceAll('_', ' ')}>
                  <strong>{k in totals ? formatNumber(totals[k]) : ''}</strong>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ValidateReportModal({
  params,
  summary,
  balanced,
  onClose,
}: {
  params: { from: string; to: string; as_of: string; filters: Record<string, string | number> };
  summary: string;
  balanced: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [comment, setComment] = useState('');
  const m = useMutation({
    mutationFn: () => reportsApi.validate({ ...params, comment: comment.trim() || undefined }),
    onSuccess: async () => {
      toast.success('Rapport validé. La validation est conservée et rappelée dans les exports.');
      await qc.invalidateQueries({ queryKey: ['report-activity'] });
      onClose();
    },
  });
  const err = m.isError ? toApiError(m.error) : null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Valider le rapport d'activité"
      description={summary}
      footer={
        <>
          <Button variant="alt" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="success" loading={m.isPending} onClick={() => m.mutate()} disabled={!balanced && comment.trim().length < 5}>
            Valider
          </Button>
        </>
      }
    >
      {err && (
        <InfoBox tone="danger" role="alert">
          {err.message}
        </InfoBox>
      )}
      {!balanced && <InfoBox tone="warn">La réconciliation présente un écart : un commentaire justificatif est obligatoire.</InfoBox>}
      <Textarea
        label="Commentaire de validation"
        rows={4}
        required={!balanced}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        hint="Conservé avec la validation (période, filtres, version de règle et instantané des chiffres)."
        error={err?.fieldErrors.comment}
      />
    </Modal>
  );
}
