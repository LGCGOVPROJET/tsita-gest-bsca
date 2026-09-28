import type { ReactNode } from 'react';
import { CheckCircle2, FileText, MessageSquare } from 'lucide-react';
import { formatDate, formatDateTime, formatLongDate } from '@/lib/format';
import { Stepper } from '@/components/ui/Stepper';
import { clientStepIndex, statusTone } from './clientStatus';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { InfoBox } from '@/components/ui/InfoBox';
import { Stat, StatList } from '@/components/ui/Stat';
import { Timeline } from '@/components/ui/Timeline';
import type { ClientComplaintView as View } from '@/types/api';

/** Vue client : jamais de notes internes, noms d'agents, avis de contrôle ni statut interne (§9.2). */
export function ClientComplaintView({ v, actions, docsActions, messagesActions }: { v: View; actions?: ReactNode; docsActions?: ReactNode; messagesActions?: ReactNode }) {
  const { steps, current } = clientStepIndex(v);
  const tone = statusTone(v);
  return (
    <>
      <section className="card" aria-labelledby="track-title">
        <div className="track-status">
          <div>
            <div className="eyebrow">Réclamation</div>
            <h2 id="track-title" className="mono" style={{ fontSize: 22, margin: '4px 0' }}>
              {v.reference}
            </h2>
            <p style={{ margin: 0 }}>{v.subject}</p>
            <span className="caption">
              {[v.product_label, v.category_label].filter(Boolean).join(' · ')}
            </span>
          </div>
          <Badge tone={tone} icon={tone === 'success' ? CheckCircle2 : undefined}>
            {v.client_status_label}
          </Badge>
        </div>
        <div style={{ marginTop: 18 }}>
          <Stepper steps={steps} current={current} label="Avancement de votre demande" showProgress={false} />
        </div>
        <StatList>
          <Stat label="État">{v.client_status_label}</Stat>
          <Stat label="Déposée le">{formatLongDate(v.received_at)}</Stat>
          <Stat label="Dernière mise à jour">{formatLongDate(v.last_update_at)}</Stat>
          <Stat label="Prochaine étape" stacked>
            {v.next_step ?? '—'}
          </Stat>
        </StatList>
        {v.final_response ? (
          <div className="final-response">
            <h3>
              <CheckCircle2 size={18} aria-hidden="true" /> Réponse définitive · {formatLongDate(v.final_response.sent_at)}
            </h3>
            <div className="pre-wrap">{v.final_response.body ?? 'La réponse vous a été adressée par le canal choisi.'}</div>
          </div>
        ) : (
          <InfoBox tone="info">Vous recevrez un message lorsqu'une réponse sera disponible.</InfoBox>
        )}
        {actions}
      </section>

      <div className="grid equal">
        <Card title="Messages">
          {v.messages.length === 0 ? (
            <p className="caption">Aucun message pour le moment.</p>
          ) : (
            <ol className="msg-list" aria-label="Messages">
              {v.messages.map((m, i) => (
                <li key={i} className={`msg ${m.from === 'client' ? 'from-client' : 'from-bank'}`}>
                  <div className="msg-head">
                    <b>
                      <MessageSquare size={13} aria-hidden="true" /> {m.from === 'client' ? 'Vous' : 'BSCA Bank'}
                    </b>
                    <span>{formatDateTime(m.date)}</span>
                  </div>
                  <div className="pre-wrap">{m.body}</div>
                </li>
              ))}
            </ol>
          )}
          {messagesActions}
        </Card>
        <div className="stack">
          <Card title="Historique">
            {v.timeline.length === 0 ? (
              <p className="caption">Aucun événement.</p>
            ) : (
              <Timeline
                label="Historique de la demande"
                items={v.timeline.map((e, i) => ({ key: i, title: e.title, meta: formatDate(e.date), body: e.description ?? undefined }))}
              />
            )}
          </Card>
          <Card title="Documents">
            {v.documents.length === 0 ? (
              <p className="caption">Aucun document partagé.</p>
            ) : (
              <ul className="file-list client-docs">
                {v.documents.map((d, i) => (
                  <li key={i} className="file-item">
                    <FileText size={17} aria-hidden="true" color="var(--blue)" />
                    <span className="fname">{d.name}</span>
                    <span className="caption">
                      {d.from === 'client' ? 'Envoyé par vous' : 'BSCA Bank'} · {formatDate(d.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {docsActions}
          </Card>
        </div>
      </div>
    </>
  );
}
