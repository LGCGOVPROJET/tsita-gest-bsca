import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  BookOpenCheck,
  Building2,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Landmark,
  Lock,
  Network,
  Package,
  Scale,
  Settings,
  ShieldCheck,
  Tags,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import { canAny } from '@/lib/permissions';
import { firstName, formatDate, formatDateTime, formatNumber, formatRatio, greeting, initials } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { InfoBox } from '@/components/ui/InfoBox';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { Timeline } from '@/components/ui/Timeline';
import { RowBars } from '@/components/ui/Charts';
import { ActivityChart, DonutChart } from '@/components/ui/DashboardCharts';
import { ADMIN_SECTIONS } from '@/features/admin/adminSections';
import '@/styles/dashboard.css';

/** Libellés lisibles des actions du journal d'audit (repli : code brut). */
const ACTION_LABELS: Record<string, string> = {
  'complaint.transition': 'Changement d’état',
  'complaint.assign': 'Affectation',
  'complaint.acknowledge': 'Accusé de réception',
  'complaint.send_response': 'Réponse envoyée',
  'complaint.quality_control': 'Contrôle qualité',
  'complaint.reopen': 'Réouverture',
  'complaint.mark_duplicate': 'Doublon signalé',
  'complaint.create': 'Création de dossier',
  'complaint.view': 'Consultation de dossier',
  'complaint.message': 'Message',
  'complaint.qualify': 'Qualification',
  'public.track': 'Suivi client consulté',
  'auth.login': 'Connexion',
  'auth.logout': 'Déconnexion',
  'auth.login_failed': 'Échec de connexion',
  'admin.users.update': 'Compte modifié',
  'admin.users.create': 'Compte créé',
  'attachment.upload': 'Pièce ajoutée',
  'attachment.download': 'Pièce téléchargée',
  'import.run': 'Import historique',
  'user.created_admin_cli': 'Administrateur créé (console)',
  'user.promoted_admin_cli': 'Administrateur promu (console)',
  'export.create': 'Export',
  'client.view': 'Consultation (client connecté)',
  'client.message': 'Message du client connecté',
  'client.attachment': 'Pièce du client connecté',
  'client.reopen': 'Réouverture par le client',
  'public.message': 'Message via le suivi public',
  'public.attachment': 'Pièce via le suivi public',
  'public.reopen': 'Réouverture via le suivi public',
  'public.complaint.create': 'Dépôt public',
  'report.validate': 'Validation de rapport',
  'report.export': 'Export de rapport',
  'complaint.export': 'Export de dossiers',
  'customer.search': 'Recherche de client',
  'admin.rules.validate': 'Règle de délai validée',
  'admin.rules.update': 'Règle de délai modifiée',
  'admin.users.unlock': 'Compte déverrouillé',
  'admin.users.reset_mfa': 'MFA réinitialisée',
  'auth.mfa.enabled': 'MFA activée',
  'auth.password.reset': 'Mot de passe réinitialisé',
};
/** Libellé d'action : table connue, sinon code rendu lisible (« admin.users.create » → « Admin · users · create »). */
const actionLabel = (a: string) =>
  ACTION_LABELS[a] ??
  a
    .split('.')
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p.replace(/_/g, ' ')))
    .join(' · ');
const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/** Types d'objets audités, en clair. */
const TARGET_LABELS: Record<string, string> = {
  Complaint: 'Dossier',
  User: 'Compte',
  DeadlineRule: 'Règle de délai',
  ImportBatch: 'Import',
  Attachment: 'Pièce jointe',
  Solution: 'Solution',
  QualityAction: 'Action qualité',
  Holiday: 'Jour férié',
  Agency: 'Agence',
  ProcessingEntity: 'Entité',
  Category: 'Catégorie',
  Product: 'Produit',
  ResponseTemplate: 'Modèle de réponse',
  ReportValidation: 'Validation de rapport',
};
const targetLabel = (t: string) => t.replace(/^([A-Za-z]+)/, (m) => TARGET_LABELS[m] ?? m);

const UNIT_LABELS: Record<string, string> = { calendar: 'jours calendaires', business: 'jours ouvrés' };



export default function AdminDashboardPage() {
  useDocumentTitle('Administration');
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: adminApi.overview, staleTime: 30_000 });
  const d = q.data;
  const loading = q.isPending;
  const u = d?.users;
  const shortcuts = ADMIN_SECTIONS.filter((sec) => canAny(user, ...sec.anyOf));

  return (
    <>
      <PageHeader
        eyebrow="Administration · vue d’ensemble"
        title={`${greeting()}, ${firstName(user?.name) || 'administrateur'}`}
        sub="Comptes, sécurité, règles de délai, référentiels, imports et journal d’audit. Aucune donnée de réclamation n’est affichée ici (séparation des responsabilités)."
        actions={
          <Link className="btn" to="/app/parametres">
            <Settings size={16} aria-hidden="true" /> Paramètres
          </Link>
        }
      />

      {q.isError && !d ? (
        <Card>
          <ErrorState message={toApiError(q.error).message} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <>
          {/* ——— Indicateurs clés ——— */}
          <section className="kpis" aria-label="Indicateurs d’administration">
            {(loading || u) && (
              <KpiCard
                label="Comptes actifs"
                value={u?.active}
                icon={UserCheck}
                tone="green"
                loading={loading}
                foot={
                  u
                    ? `${plural(u.total, 'compte collaborateur', 'comptes collaborateurs')} · ${plural(u.clients, 'client', 'clients')}`
                    : undefined
                }
                to="/app/parametres?onglet=utilisateurs"
                linkLabel="Gérer les comptes"
              />
            )}
            {(loading || u) && (
              <KpiCard
                label="Double authentification"
                value={null}
                display={u ? formatRatio(u.mfa_enabled, u.total, u.total ? Math.round((u.mfa_enabled / u.total) * 1000) / 10 : null) : '—'}
                icon={KeyRound}
                tone={u && u.mfa_enabled < u.total ? 'amber' : 'green'}
                loading={loading}
                foot="Comptes ayant activé la MFA · exigée hors démonstration pour les rôles sensibles"
                definition="Nombre de comptes collaborateurs ayant configuré un code TOTP, rapporté au nombre total de comptes collaborateurs."
              />
            )}
            {(loading || d?.rules) && (
              <KpiCard
                label="Règles à valider"
                value={d?.rules?.a_valider}
                icon={Scale}
                tone={d?.rules?.a_valider ? 'amber' : 'green'}
                loading={loading}
                foot={
                  d?.rules
                    ? `${plural(d.rules.valide, 'validée', 'validées')} · ${formatNumber(d.rules.demonstration)} de démonstration`
                    : undefined
                }
                to="/app/parametres?onglet=regles"
                linkLabel="Voir les règles"
              />
            )}
            {(loading || d?.imports) && (
              <KpiCard
                label="Anomalies d’import"
                value={d?.imports?.anomalies_open}
                icon={AlertOctagon}
                tone={d?.imports?.anomalies_open ? 'danger' : 'green'}
                loading={loading}
                foot={d?.imports ? `À traiter · ${plural(d.imports.batches, 'lot importé', 'lots importés')}` : undefined}
                to="/app/parametres?onglet=imports"
                linkLabel="Traiter"
              />
            )}
            {!loading && !u && d?.audit && (
              <KpiCard
                compact={false}
                label="Événements (7 jours)"
                value={d.audit.last_7_days}
                icon={Activity}
                foot={`${formatNumber(d.audit.today)} aujourd’hui`}
                to="/app/parametres?onglet=audit"
                linkLabel="Journal d’audit"
              />
            )}
          </section>
          {(loading || u) && (
            <section className="kpis compact-row two-up" aria-label="Indicateurs de sécurité">
              {(loading || u) && (
                <KpiCard
                  compact
                  label="Comptes verrouillés"
                  value={u?.locked}
                  icon={Lock}
                  tone={u?.locked ? 'danger' : 'blue'}
                  loading={loading}
                  foot="Après 10 échecs de connexion (15 min)"
                />
              )}
              {(loading || u) && (
                <KpiCard
                  compact
                  label="Comptes inactifs"
                  value={u?.inactive}
                  icon={UserX}
                  loading={loading}
                  foot="Désactivés, conservés pour l’historique"
                />
              )}
              {(loading || u) && (
                <KpiCard
                  compact
                  label="Jamais connectés"
                  value={u?.never_logged}
                  icon={Users}
                  tone={u?.never_logged ? 'amber' : 'blue'}
                  loading={loading}
                  foot="Comptes créés sans première connexion"
                />
              )}
              {(loading || d?.audit) && (
                <KpiCard
                  compact
                  label="Événements aujourd’hui"
                  value={d?.audit?.today}
                  icon={Activity}
                  loading={loading}
                  foot={d?.audit ? `${formatNumber(d.audit.last_7_days)} sur 7 jours` : undefined}
                />
              )}
            </section>
          )}

          {/* ——— Points de vigilance et connexions ——— */}
          {(loading || d?.health) && (
            <div className="dash-lists">
              <Card
                title="Points de vigilance"
                caption="Checklist avant mise en production (voir docs/SECURITE.md)"
                actions={
                  d?.health && (
                    <span className={`admin-score ${d.health.every((h) => h.ok) ? 'ok' : 'warn'}`}>
                      {d.health.filter((h) => h.ok).length} / {d.health.length} conformes
                    </span>
                  )
                }
              >
                {loading ? (
                  <Skeleton height={200} />
                ) : (
                  <ul className="admin-health">
                    {d!.health!.map((h) => {
                      const content = (
                        <>
                          <span className="admin-health-icon" aria-hidden="true">
                            {h.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                          </span>
                          <span className="admin-health-text">
                            <strong>{h.label}</strong>
                            <small>{h.detail}</small>
                          </span>
                          <span className="sr-only">{h.ok ? 'Conforme' : 'À traiter'}</span>
                          {h.to && <ArrowRight size={15} className="admin-health-arrow" aria-hidden="true" />}
                        </>
                      );
                      return (
                        <li key={h.key} className={h.ok ? 'ok' : 'warn'}>
                          {h.to ? <Link to={h.to}>{content}</Link> : <div>{content}</div>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              <Card title="Dernières connexions" caption="Comptes collaborateurs et clients">
                {loading ? (
                  <Skeleton height={200} />
                ) : u?.recent_logins.length ? (
                  <ul className="admin-logins">
                    {u.recent_logins.map((l) => (
                      <li key={l.id}>
                        <span className="admin-avatar" aria-hidden="true">
                          {initials(l.name)}
                        </span>
                        <span>
                          <strong>{l.name}</strong>
                          <small>{l.role_label}</small>
                        </span>
                        <time dateTime={l.date}>{formatDateTime(l.date)}</time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="Aucune connexion" />
                )}
              </Card>
            </div>
          )}

          {/* ——— Visualisation principale ——— */}
          {loading ? (
            <SkeletonCard lines={8} />
          ) : (
            d?.audit && (
              <Card
                className="dash-main"
                title="Activité de la plateforme"
                caption="Événements du journal d’audit par jour · 14 derniers jours · fuseau Africa/Brazzaville"
              >
                <div className="dash-main-body">
                  <ActivityChart data={d.audit.daily} caption="Événements du journal d’audit par jour" />
                  <aside className="dash-summary" aria-label="Actions les plus fréquentes">
                    <h3 className="dash-side-title">Actions les plus fréquentes (7 jours)</h3>
                    {d.audit.top_actions.length ? (
                      <RowBars
                        data={d.audit.top_actions.map((a) => ({ label: actionLabel(a.label), count: a.count }))}
                        label="Actions les plus fréquentes"
                        unit="événements"
                        dominantLabel="Action principale"
                      />
                    ) : (
                      <p className="caption">Aucun événement sur 7 jours.</p>
                    )}
                    <Link className="btn text" to="/app/parametres?onglet=audit">
                      Ouvrir le journal complet →
                    </Link>
                  </aside>
                </div>
              </Card>
            )
          )}

          {/* ——— Répartitions et référentiels ——— */}
          <div className="dash-grid-3">
            {(loading || u) && (
              <Card title="Comptes par rôle" caption="Collaborateurs, hors clients du portail">
                {loading ? (
                  <Skeleton height={170} />
                ) : (
                  u && (
                    <DonutChart
                      data={u.by_role.filter((r) => r.count > 0).map((r) => ({ label: r.label, count: r.count }))}
                      label="Comptes par rôle"
                      unit="comptes"
                      dominantLabel="Rôle le plus représenté"
                    />
                  )
                )}
              </Card>
            )}
            {(loading || d?.rules) && (
              <Card
                title="Règles de délai"
                caption="Seules les règles validées s’appliquent hors démonstration"
                actions={
                  <Link className="btn text" to="/app/parametres?onglet=regles">
                    Gérer →
                  </Link>
                }
              >
                {loading ? (
                  <Skeleton height={170} />
                ) : (
                  d?.rules && (
                    <>
                      <ul className="admin-pills" aria-label="Règles par statut">
                        <li className="ok">
                          <b>{formatNumber(d.rules.valide)}</b> {d.rules.valide > 1 ? 'validées' : 'validée'}
                        </li>
                        <li className="warn">
                          <b>{formatNumber(d.rules.a_valider)}</b> à valider
                        </li>
                        <li>
                          <b>{formatNumber(d.rules.brouillon)}</b> {d.rules.brouillon > 1 ? 'brouillons' : 'brouillon'}
                        </li>
                      </ul>
                      {d.rules.pending.length ? (
                        <ul className="admin-list">
                          {d.rules.pending.map((r) => (
                            <li key={r.id}>
                              <span>
                                <strong>{r.label}</strong>
                                <small>
                                  {r.duration} {UNIT_LABELS[r.unit] ?? r.unit} · v{r.version}
                                </small>
                              </span>
                              {r.is_demo ? <Badge tone="warn">Démonstration</Badge> : <Badge tone="info">À valider</Badge>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="caption">Aucune règle en attente de validation.</p>
                      )}
                      {d.rules.demonstration > 0 && (
                        <InfoBox tone="warn">
                          Des règles de démonstration sont actives : à faire valider par la conformité avant la mise en production.
                        </InfoBox>
                      )}
                    </>
                  )
                )}
              </Card>
            )}
            {(loading || d?.referentials) && (
              <Card
                title="Référentiels"
                caption="Éléments actifs / total"
                actions={
                  <Link className="btn text" to="/app/parametres?onglet=agences">
                    Gérer →
                  </Link>
                }
              >
                {loading ? (
                  <Skeleton height={170} />
                ) : (
                  d?.referentials && (
                    <>
                      <ul className="admin-refs">
                        {(
                          [
                            ['agencies', 'Agences', Building2],
                            ['entities', 'Entités', Network],
                            ['categories', 'Catégories', Tags],
                            ['products', 'Produits', Package],
                            ['templates', 'Modèles', FileText],
                          ] as const
                        ).map(([key, label, Icon]) => (
                          <li key={key}>
                            <Icon size={16} aria-hidden="true" />
                            <span>{label}</span>
                            <b>
                              {formatNumber(d.referentials![key].active)}
                              <small> / {formatNumber(d.referentials![key].total)}</small>
                            </b>
                          </li>
                        ))}
                      </ul>
                      <h3 className="dash-side-title">Prochains jours fériés</h3>
                      <ul className="admin-list compact">
                        {d.referentials.holidays_next.map((h) => (
                          <li key={h.date}>
                            <span>
                              <strong>{h.label}</strong>
                            </span>
                            <small>{formatDate(h.date)}</small>
                          </li>
                        ))}
                      </ul>
                    </>
                  )
                )}
              </Card>
            )}
          </div>

          {/* ——— Journal et imports ——— */}
          <div className="dash-lists">
            {(loading || d?.audit) && (
              <Card
                title="Dernières actions"
                caption="Journal d’audit append-only (non modifiable)"
                actions={
                  <Link className="btn text" to="/app/parametres?onglet=audit">
                    Tout voir →
                  </Link>
                }
              >
                {loading ? (
                  <Skeleton height={200} />
                ) : d?.audit?.recent.length ? (
                  <Timeline
                    label="Dernières actions"
                    items={d.audit.recent.map((e) => ({
                      key: e.id,
                      title: (
                        <>
                          {actionLabel(e.action)}
                          {e.target ? <span className="cell-sub">{targetLabel(e.target)}</span> : null}
                        </>
                      ),
                      meta: `${formatDateTime(e.date)} · ${e.user ?? 'Système ou portail public'}`,
                    }))}
                  />
                ) : (
                  <EmptyState title="Aucun événement" />
                )}
              </Card>
            )}
            {(loading || d?.imports) && (
              <Card
                title="Dernier import historique"
                caption="Import idempotent : un même fichier n’est jamais importé deux fois"
                actions={
                  <Link className="btn text" to="/app/parametres?onglet=imports">
                    Imports →
                  </Link>
                }
              >
                {loading ? (
                  <Skeleton height={200} />
                ) : d?.imports?.last ? (
                  <>
                    <p className="admin-file">
                      <FileSpreadsheet size={18} aria-hidden="true" />
                      <span>
                        <strong>{d.imports.last.filename}</strong>
                        <small>
                          {d.imports.last.source_system} · {formatDateTime(d.imports.last.date)}
                        </small>
                      </span>
                    </p>
                    <ul className="admin-refs">
                      <li>
                        <BookOpenCheck size={16} aria-hidden="true" />
                        <span>Lignes lues</span>
                        <b>{formatNumber(d.imports.last.rows_total)}</b>
                      </li>
                      <li>
                        <ShieldCheck size={16} aria-hidden="true" />
                        <span>Dossiers créés</span>
                        <b>{formatNumber(d.imports.last.rows_created)}</b>
                      </li>
                      <li>
                        <Landmark size={16} aria-hidden="true" />
                        <span>Lignes ignorées</span>
                        <b>{formatNumber(d.imports.last.rows_skipped)}</b>
                      </li>
                      <li className={d.imports.last.rows_anomalies ? 'danger' : ''}>
                        <AlertOctagon size={16} aria-hidden="true" />
                        <span>Anomalies</span>
                        <b>{formatNumber(d.imports.last.rows_anomalies)}</b>
                      </li>
                    </ul>
                    <p className="caption">
                      Les dossiers impossibles à interpréter sont signalés pour décision humaine ; aucune date de réponse n’est inventée.
                    </p>
                  </>
                ) : (
                  <EmptyState title="Aucun import" description="Aucun registre historique n’a encore été importé." />
                )}
              </Card>
            )}
          </div>

          {/* ——— Accès rapides ——— */}
          {shortcuts.length > 0 && (
            <section className="admin-shortcuts" aria-labelledby="admin-shortcuts-title">
              <h2 id="admin-shortcuts-title">Accès rapides</h2>
              <ul>
                {shortcuts.map(({ key: onglet, label, icon: Icon }) => (
                  <li key={onglet}>
                    <Link to={`/app/parametres?onglet=${onglet}`}>
                      <Icon size={18} aria-hidden="true" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
