import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  Archive,
  CheckCheck,
  History,
  Inbox,
  Percent,
  Plus,
  Send,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { dashboardApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  addDays,
  actorName,
  firstName,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRatio,
  greeting,
  monthStart,
  todayLocal,
} from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterBar, type FilterKey } from '@/features/filters/FilterBar';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card } from '@/components/ui/Card';
import { RowBars } from '@/components/ui/Charts';
import { DonutChart, RingGauge, TrendChart } from '@/components/ui/DashboardCharts';
import { DeadlineBadge, StatusBadge } from '@/components/ui/Badge';
import { InfoBox } from '@/components/ui/InfoBox';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { Timeline } from '@/components/ui/Timeline';
import { WorkloadStrip } from '@/features/workload/WorkloadStrip';
import '@/styles/dashboard.css';

const KEYS = ['from', 'to', 'as_of', 'agency_id', 'entity_id', 'category_id', 'channel'] as const;

/** Définitions par défaut (§8) si l'API n'en fournit pas. */
const DEFAULT_DEFS: Record<string, string> = {
  received: 'Références uniques dont la date de réception se situe dans la période et correspond aux filtres actifs.',
  responded: 'Références uniques dont la date de réponse finale se situe dans la période.',
  stock: 'Dossiers reçus jusqu’à la date de calcul sans réponse finale à cette date. Une réouverture compte comme une nouvelle entrée.',
  at_risk: 'Dossiers ouverts, pas encore en retard, dont la pré-alerte interne est atteinte.',
  cohort_treated: 'Dossiers reçus dans la période ayant reçu une réponse finale au plus tard à la date de calcul.',
  treatment_rate: 'Cohorte traitée divisée par les réclamations reçues sur la période (numérateur / dénominateur affichés).',
  late_open: 'Dossiers ouverts à la date de calcul dont l’échéance de réponse finale est dépassée.',
  late_closed: 'Dossiers répondus dans la période après leur échéance de réponse finale.',
};

type Preset = '30j' | 'mois' | '6m' | 'annee' | 'perso';

export default function DashboardPage() {
  useDocumentTitle('Tableau de bord');
  const { user } = useAuth();
  const today = todayLocal();
  const defaults = useMemo(() => ({ from: monthStart(today, 5), to: today, as_of: today }), [today]);
  const { values, set, setMany, reset, activeCount } = useUrlFilters(KEYS, defaults);

  const q = useQuery({
    queryKey: ['dashboard', values],
    queryFn: () => dashboardApi.get(values),
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  const defs = { ...DEFAULT_DEFS, ...(d?.meta.definitions ?? {}) };
  const period = `du ${formatDate(values.from)} au ${formatDate(values.to)}`;
  const asOf = `au ${formatDate(values.as_of)}`;

  const preset: Preset =
    values.to === today && values.from === addDays(today, -29)
      ? '30j'
      : values.to === today && values.from === monthStart(today, 0)
        ? 'mois'
        : values.to === today && values.from === monthStart(today, 5)
          ? '6m'
          : values.to === today && values.from === `${today.slice(0, 4)}-01-01`
            ? 'annee'
            : 'perso';

  const applyPreset = (p: Preset) => {
    if (p === '30j') setMany({ from: addDays(today, -29), to: today });
    if (p === 'mois') setMany({ from: monthStart(today, 0), to: today });
    if (p === '6m') setMany({ from: monthStart(today, 5), to: today });
    if (p === 'annee') setMany({ from: `${today.slice(0, 4)}-01-01`, to: today });
  };

  const k = d?.kpis;
  const loading = q.isPending;
  const totals = useMemo(() => {
    const monthly = d?.monthly ?? [];
    const received = monthly.reduce((sum, m) => sum + m.received, 0);
    const responded = monthly.reduce((sum, m) => sum + m.responded, 0);
    const peak = monthly.reduce<(typeof monthly)[number] | null>((p, m) => (!p || m.received > p.received ? m : p), null);
    return { received, responded, gap: received - responded, peak };
  }, [d]);

  return (
    <>
      <PageHeader
        eyebrow={d?.meta.rule_is_demo ? 'Vue de démonstration' : 'Vue d’ensemble'}
        title={`${greeting()}, ${firstName(user?.name) || 'équipe BSCA'}`}
        sub="Suivez les réclamations, priorisez les réponses et mesurez les solutions."
        actions={
          can(user, 'complaints.create') && (
            <Link className="btn" to="/app/reclamations/nouvelle">
              <Plus size={16} aria-hidden="true" /> Nouvelle réclamation
            </Link>
          )
        }
      />

      <WorkloadStrip />

      {d?.meta.rule_is_demo && (
        <InfoBox tone="warn" role="note">
          <strong>Règle de démonstration — non validée par la conformité BSCA.</strong> Les échéances et retards affichés reposent sur des
          règles fictives (accusé 10 jours ouvrés, réponse 45 jours calendaires) en attente de validation.
        </InfoBox>
      )}

      <FilterBar
        label="Filtres du tableau de bord"
        fields={['from', 'to', 'as_of', 'agency_id', 'entity_id', 'category_id', 'channel'] satisfies FilterKey[]}
        values={values}
        onChange={(key, v) => set(key as (typeof KEYS)[number], v)}
        onReset={activeCount ? reset : undefined}
        note={
          <>
            Période {period} · calcul {asOf}. Filtres partagés avec les listes et les exports.
            {q.isFetching && !loading && <span className="sr-only"> Mise à jour…</span>}
          </>
        }
      >
        <label className="field">
          <span className="label-text">Période rapide</span>
          <select value={preset} onChange={(e) => applyPreset(e.target.value as Preset)}>
            <option value="30j">30 derniers jours</option>
            <option value="mois">Mois en cours</option>
            <option value="6m">6 derniers mois</option>
            <option value="annee">Année en cours</option>
            <option value="perso" disabled>
              Personnalisée
            </option>
          </select>
        </label>
      </FilterBar>

      {q.isError && !d ? (
        <Card>
          <ErrorState message={toApiError(q.error).message} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <div aria-busy={q.isFetching || undefined} style={{ opacity: q.isFetching && !loading ? 0.7 : 1, transition: 'opacity 180ms' }}>
          {/* ——— Indicateurs clés ——— */}
          <section className="kpis" aria-label="Indicateurs principaux">
            <KpiCard
              label="Demandes reçues"
              value={k?.received}
              icon={Inbox}
              loading={loading}
              foot={`Période ${period}`}
              definition={defs.received}
              to={`/app/reclamations?from=${values.from}&to=${values.to}`}
            />
            <KpiCard
              label="Réponses envoyées"
              value={k?.responded}
              icon={Send}
              tone="green"
              loading={loading}
              foot={`Réponses finales ${period}`}
              definition={defs.responded}
            />
            <KpiCard
              label="Stock à date"
              value={k?.stock}
              icon={Archive}
              loading={loading}
              foot={`Dossiers ouverts ${asOf}`}
              definition={defs.stock}
            />
            <KpiCard
              label="À surveiller"
              value={k?.at_risk}
              icon={AlertTriangle}
              tone="amber"
              loading={loading}
              foot={`Pré-alerte atteinte ${asOf}`}
              definition={defs.at_risk}
              to="/app/delais"
              linkLabel="Voir les alertes"
            />
          </section>
          <section className="kpis compact-row" aria-label="Indicateurs complémentaires">
            <KpiCard
              compact
              label="Cohorte traitée"
              value={k?.cohort_treated}
              icon={CheckCheck}
              tone="green"
              loading={loading}
              foot={`Reçues ${period}, répondues ${asOf}`}
              definition={defs.cohort_treated}
            />
            <KpiCard
              compact
              label="Taux de traitement"
              value={null}
              display={k ? formatRatio(k.treatment_rate.numerator, k.treatment_rate.denominator, k.treatment_rate.value) : '—'}
              icon={Percent}
              loading={loading}
              foot={`Traitées / reçues, calcul ${asOf}`}
              definition={defs.treatment_rate}
            />
            <KpiCard
              compact
              label="Retard ouvert"
              value={k?.late_open}
              icon={AlertOctagon}
              tone={k?.late_open ? 'danger' : 'blue'}
              loading={loading}
              foot={`Échéance dépassée ${asOf}`}
              definition={defs.late_open}
              to="/app/delais?queue=en_retard"
              linkLabel="Traiter"
            />
            <KpiCard
              compact
              label="Retard clos"
              value={k?.late_closed}
              icon={History}
              loading={loading}
              foot={`Répondus après échéance ${period}`}
              definition={defs.late_closed}
              to="/app/delais?queue=clos_en_retard"
              linkLabel="Analyser"
            />
          </section>

          {/* ——— Visualisation principale ——— */}
          {loading ? (
            <SkeletonCard lines={9} />
          ) : (
            <Card
              className="dash-main"
              title="Évolution des réclamations"
              caption={`Reçues et réponses envoyées par mois · ${period}`}
              actions={
                <div className="legend" aria-hidden="true">
                  <span>
                    <i className="dot" /> Reçues
                  </span>
                  <span>
                    <i className="dot red" /> Réponses
                  </span>
                </div>
              }
            >
              <div className="dash-main-body">
                <TrendChart data={d?.monthly ?? []} caption="Réclamations reçues et réponses envoyées par mois" />
                <aside className="dash-summary" aria-label="Synthèse de la période">
                  <RingGauge
                    value={k?.treatment_rate.value ?? null}
                    label="Taux de traitement"
                    sub={
                      k ? `${formatNumber(k.treatment_rate.numerator)} / ${formatNumber(k.treatment_rate.denominator)} dossiers` : undefined
                    }
                  />
                  <dl className="dash-figures">
                    <div>
                      <dt>Reçues</dt>
                      <dd>{formatNumber(totals.received)}</dd>
                    </div>
                    <div>
                      <dt>Réponses</dt>
                      <dd>{formatNumber(totals.responded)}</dd>
                    </div>
                    <div>
                      <dt>Écart entrées − réponses</dt>
                      <dd className={totals.gap > 0 ? 'up' : 'down'}>
                        {totals.gap > 0 ? <TrendingUp size={16} aria-hidden="true" /> : <TrendingDown size={16} aria-hidden="true" />}
                        {totals.gap > 0 ? '+' : ''}
                        {formatNumber(totals.gap)}
                      </dd>
                    </div>
                    {totals.peak && (
                      <div>
                        <dt>Mois le plus chargé</dt>
                        <dd>
                          {totals.peak.label} · {formatNumber(totals.peak.received)}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <p className="caption">
                    Écart positif : le stock augmente sur la période. Calcul au {formatDate(values.as_of)}, fuseau Africa/Brazzaville.
                  </p>
                </aside>
              </div>
            </Card>
          )}

          {/* ——— Répartitions ——— */}
          <div className="dash-grid-3">
            <Card title="Nature des demandes" caption={`Répartition par catégorie · ${period}`}>
              {loading ? (
                <Skeleton height={170} />
              ) : d && d.by_category.length > 0 ? (
                <RowBars data={d.by_category.slice(0, 6)} label="Réclamations par catégorie" />
              ) : (
                <EmptyState title="Aucune réclamation" description="Aucune réclamation reçue pour ces filtres." />
              )}
            </Card>
            <Card title="Canaux de réception" caption={`Répartition par canal · ${period}`}>
              {loading ? (
                <Skeleton height={170} />
              ) : d && d.by_channel.length > 0 ? (
                <DonutChart data={d.by_channel} label="Réclamations par canal" />
              ) : (
                <EmptyState title="Aucune donnée" />
              )}
            </Card>
            <Card
              title="Délais et échéances"
              caption={`Situation ${asOf}`}
              actions={
                <Link className="btn text" to="/app/delais">
                  Tout voir →
                </Link>
              }
            >
              <ul className="dash-deadlines">
                <li className="warn">
                  <Link to="/app/delais?queue=a_echeance">
                    <AlertTriangle size={18} aria-hidden="true" />
                    <span>À risque</span>
                    <b>{loading ? '…' : formatNumber(k?.at_risk)}</b>
                  </Link>
                </li>
                <li className="danger">
                  <Link to="/app/delais?queue=en_retard">
                    <AlertOctagon size={18} aria-hidden="true" />
                    <span>En retard (ouverts)</span>
                    <b>{loading ? '…' : formatNumber(k?.late_open)}</b>
                  </Link>
                </li>
                <li>
                  <Link to="/app/delais?queue=clos_en_retard">
                    <History size={18} aria-hidden="true" />
                    <span>Clos en retard</span>
                    <b>{loading ? '…' : formatNumber(k?.late_closed)}</b>
                  </Link>
                </li>
              </ul>
              <p className="caption" style={{ marginBottom: 0 }}>
                Les échéances ne sont jamais suspendues pendant une attente d'information.
                {d?.meta.rule_version ? ` Version de règle : ${d.meta.rule_version}.` : ''}
              </p>
            </Card>
          </div>

          {/* ——— Listes opérationnelles ——— */}
          <div className="dash-lists">
            <Card
              title="Priorités du jour"
              caption="Dossiers les plus urgents dans votre périmètre"
              actions={
                <Link className="btn text" to="/app/delais">
                  Voir les alertes →
                </Link>
              }
            >
              {loading ? (
                <Skeleton height={160} />
              ) : d && d.priorities.length > 0 ? (
                <div className="tablewrap">
                  <table className="table stack-sm dash-priorities">
                    <caption className="sr-only">Priorités du jour</caption>
                    <thead>
                      <tr>
                        <th scope="col">Référence</th>
                        <th scope="col">Motif</th>
                        <th scope="col">État</th>
                        <th scope="col">Échéance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.priorities.map((c) => (
                        <tr key={c.id}>
                          <td data-label="Référence">
                            <Link className="ref-link" to={`/app/reclamations/${c.id}`}>
                              {c.reference}
                            </Link>
                          </td>
                          <td data-label="Motif">
                            {c.category?.label ?? c.subject}
                            <span className="cell-sub">{formatDate(c.due_at)}</span>
                          </td>
                          <td data-label="État">
                            <StatusBadge status={c.status} label={c.status_label} />
                          </td>
                          <td data-label="Échéance">
                            <DeadlineBadge flag={c.deadline_flag} label={c.deadline_flag_label} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="Rien d'urgent" description="Aucun dossier à risque ou en retard dans votre périmètre." />
              )}
            </Card>

            <Card title="Dernières actions" caption="Événements récents sur les dossiers de votre périmètre">
              {loading ? (
                <Skeleton height={160} />
              ) : d && d.recent_events.length > 0 ? (
                <Timeline
                  label="Dernières actions"
                  items={d.recent_events.slice(0, 6).map((e, i) => ({
                    key: `${e.reference}-${i}`,
                    title: (
                      <>
                        {e.complaint_id ? (
                          <Link className="ref-link" to={`/app/reclamations/${e.complaint_id}`}>
                            {e.reference}
                          </Link>
                        ) : (
                          e.reference
                        )}{' '}
                        · {e.title}
                      </>
                    ),
                    meta: `${formatDateTime(e.date)} · ${actorName(e.actor, 'Système')}`,
                  }))}
                />
              ) : (
                <EmptyState title="Aucune action récente" />
              )}
            </Card>
          </div>

          <p className="caption dash-footnote">
            Reçues = date de réception · Réponses = date d'envoi au client · Stock = situation à une date · Délais = règle validée et
            versionnée. Chaque indicateur affiche sa définition via le bouton <span aria-hidden="true">ⓘ</span>
            <span className="sr-only">« Définition »</span>.
          </p>
        </div>
      )}
    </>
  );
}
