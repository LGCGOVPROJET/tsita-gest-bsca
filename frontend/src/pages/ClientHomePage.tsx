import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, FileSearch, Hourglass, Inbox, MessageCircleQuestion, Plus, Search, ShieldCheck } from 'lucide-react';
import { clientApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import { firstName, formatLongDate, formatNumber, greeting } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { clientStepIndex, statusTone } from '@/features/public/clientStatus';
import '@/styles/dashboard.css';

export default function ClientHomePage() {
  useDocumentTitle('Mes réclamations');
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['client-complaints'], queryFn: clientApi.list });
  const list = q.data ?? [];

  // Synthèse par étape du parcours client (reçue, en cours, information demandée, réponse).
  const summary = list.reduce(
    (acc, c) => {
      const { current, steps } = clientStepIndex(c);
      if (current >= 2) acc.answered += 1;
      else if (steps[1]?.alert) acc.info += 1;
      else acc.progress += 1;
      return acc;
    },
    { progress: 0, info: 0, answered: 0 },
  );

  return (
    <>
      <PageHeader
        eyebrow="Espace client"
        title={`${greeting()}, ${firstName(user?.name)}`}
        sub="Retrouvez l'ensemble de vos réclamations, leur avancement et les réponses de BSCA Bank."
        actions={
          <Link className="btn" to="/deposer">
            <Plus size={16} aria-hidden="true" /> Nouvelle réclamation
          </Link>
        }
      />

      {!q.isPending && !q.isError && list.length > 0 && (
        <section className="kpis client-kpis" aria-label="Synthèse de mes réclamations">
          <article className="card kpi compact">
            <span className="kpi-icon" aria-hidden="true">
              <Inbox size={18} />
            </span>
            <h2 className="k-label">Réclamations</h2>
            <div className="number">{formatNumber(list.length)}</div>
            <small>Déposées depuis votre espace ou en agence</small>
          </article>
          <article className="card kpi compact">
            <span className="kpi-icon" aria-hidden="true">
              <Hourglass size={18} />
            </span>
            <h2 className="k-label">En cours d’analyse</h2>
            <div className="number">{formatNumber(summary.progress)}</div>
            <small>Nos équipes examinent votre demande</small>
          </article>
          <article className={`card kpi compact ${summary.info ? 'amber' : ''}`}>
            <span className="kpi-icon" aria-hidden="true">
              <MessageCircleQuestion size={18} />
            </span>
            <h2 className="k-label">Information demandée</h2>
            <div className="number">{formatNumber(summary.info)}</div>
            <small>{summary.info ? 'Un complément est attendu de votre part' : 'Aucune action de votre part'}</small>
          </article>
          <article className="card kpi compact green">
            <span className="kpi-icon" aria-hidden="true">
              <CheckCircle2 size={18} />
            </span>
            <h2 className="k-label">Réponse reçue</h2>
            <div className="number">{formatNumber(summary.answered)}</div>
            <small>Réponse envoyée ou dossier clôturé</small>
          </article>
        </section>
      )}

      {q.isPending ? (
        <div className="client-cards">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : q.isError ? (
        <div className="card">
          <ErrorState message={toApiError(q.error).message} onRetry={() => q.refetch()} />
        </div>
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FileSearch}
            title="Aucune réclamation"
            description="Vous n'avez pas encore déposé de réclamation."
            action={
              <Link className="btn" to="/deposer">
                Déposer une réclamation
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <h2 className="client-list-title">Mes dossiers</h2>
          <ul className="client-cards" aria-label="Mes réclamations">
            {list.map((c) => {
              const { steps, current } = clientStepIndex(c);
              const pct = Math.round((current / (steps.length - 1)) * 100);
              return (
                <li key={c.reference}>
                  <Link
                    to={`/client/${encodeURIComponent(c.reference)}`}
                    aria-label={`${c.reference} — ${c.subject} — ${c.client_status_label}`}
                  >
                    <article className="card client-card">
                      <div className="row between">
                        <span className="mono" style={{ fontWeight: 800, color: 'var(--blue)' }}>
                          {c.reference}
                        </span>
                        <Badge tone={statusTone(c)}>{c.client_status_label}</Badge>
                      </div>
                      <h3>{c.subject}</h3>
                      <div className="client-progress" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} className={steps[1]?.alert && current === 1 ? 'warn' : ''} />
                      </div>
                      <p className="client-step">
                        Étape {current + 1} sur {steps.length} · {steps[current]?.label}
                      </p>
                      <p className="caption" style={{ margin: 0 }}>
                        Déposée le {formatLongDate(c.received_at)} · mise à jour le {formatLongDate(c.last_update_at)}
                      </p>
                      {c.next_step && <p className="client-next">Prochaine étape : {c.next_step}</p>}
                      <span className="client-open">
                        Ouvrir le dossier <ArrowRight size={15} aria-hidden="true" />
                      </span>
                    </article>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <section className="client-help">
        <div>
          <Search size={20} aria-hidden="true" />
          <span>
            <strong>Un dossier déposé sans compte ?</strong>
            <small>Consultez-le avec sa référence et son code de suivi.</small>
          </span>
          <Link className="btn alt sm" to="/suivi">
            Suivre une demande
          </Link>
        </div>
        <div>
          <ShieldCheck size={20} aria-hidden="true" />
          <span>
            <strong>Vos échanges sont protégés</strong>
            <small>BSCA Bank ne vous demandera jamais votre code secret ni votre mot de passe.</small>
          </span>
        </div>
      </section>
    </>
  );
}
