import { useState } from 'react';
import { Lock, MessageSquare, Send } from 'lucide-react';
import { complaintsApi } from '@/api/endpoints';
import { actorName, formatDateTime, itemDate } from '@/lib/format';
import { useReferentials } from '@/hooks/useReferentials';
import { Badge, InternalBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoBox } from '@/components/ui/InfoBox';
import type { ComplaintDetail, Message } from '@/types/api';
import { useCaseMutation } from './useCaseMutation';

function channelLabel(ch: Message['channel']): string | null {
  if (!ch) return null;
  return typeof ch === 'string' ? ch : ch.label;
}

/** Messages client et notes internes clairement séparés (couleur, icône, libellé, motif hachuré). */
export function ExchangesTab({ c, canWrite }: { c: ComplaintDetail; canWrite: boolean }) {
  const ref = useReferentials();
  const [kind, setKind] = useState<'client_message' | 'internal_note'>('internal_note');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState('courriel');
  const [filter, setFilter] = useState<'all' | 'client_message' | 'internal_note'>('all');
  /** Un message client ne peut pas être rappelé : confirmation explicite avant envoi. */
  const [confirming, setConfirming] = useState(false);
  const send = useCaseMutation(
    c.id,
    () => complaintsApi.addMessage(c.id, { kind, body: body.trim(), channel: kind === 'client_message' ? channel : undefined }),
    kind === 'internal_note' ? 'Note interne ajoutée.' : 'Message au client enregistré.',
  );

  const msgs = [...c.messages]
    .filter((m) => filter === 'all' || m.kind === filter)
    .sort((a, b) => (a.sent_at ?? itemDate(a)).localeCompare(b.sent_at ?? itemDate(b)));
  const nbClient = c.messages.filter((m) => m.kind === 'client_message').length;
  const nbNotes = c.messages.length - nbClient;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="choice-row" role="radiogroup" aria-label="Afficher">
          {(
            [
              ['all', `Tout (${c.messages.length})`],
              ['client_message', `Échanges client (${nbClient})`],
              ['internal_note', `Notes internes (${nbNotes})`],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="choice">
              <input type="radio" name="msg-filter" checked={filter === k} onChange={() => setFilter(k)} />
              {l}
            </label>
          ))}
        </div>
      </div>

      {msgs.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Aucun échange" description="Les messages du client et les notes internes apparaîtront ici." />
      ) : (
        <ol className="msg-list" aria-label="Échanges du dossier">
          {msgs.map((m) => {
            const internal = m.kind === 'internal_note';
            const fromClient = !internal && m.author_is_client;
            return (
              <li key={m.id} className={`msg ${internal ? 'internal' : fromClient ? 'from-client' : 'from-bank'}`}>
                <div className="msg-head">
                  <span className="badge-row">
                    {internal ? (
                      <InternalBadge>Note interne · jamais visible du client</InternalBadge>
                    ) : fromClient ? (
                      <Badge tone="info" icon={MessageSquare}>
                        Message du client
                      </Badge>
                    ) : (
                      <Badge tone="neutral" icon={Send}>
                        Message envoyé au client
                      </Badge>
                    )}
                    <b>{fromClient ? c.customer?.full_name ?? 'Client' : actorName(m.author, 'BSCA')}</b>
                  </span>
                  <span>
                    {formatDateTime(m.sent_at ?? itemDate(m))}
                    {channelLabel(m.channel) ? ` · ${channelLabel(m.channel)}` : ''}
                    {m.delivery_status === 'echec' && (
                      <>
                        {' '}
                        · <Badge tone="danger">Échec d'envoi</Badge>
                      </>
                    )}
                  </span>
                </div>
                {m.subject && <strong>{m.subject}</strong>}
                <div className="pre-wrap">{m.body}</div>
              </li>
            );
          })}
        </ol>
      )}

      {canWrite && (
        <form
          className={`card flat spacing compose-form ${kind === 'internal_note' ? 'internal' : 'client'}`}
          aria-label="Rédiger un écrit"
          onSubmit={async (e) => {
            e.preventDefault();
            if (body.trim().length < 2) return;
            if (kind === 'client_message' && !confirming) {
              setConfirming(true);
              return;
            }
            await send
              .mutateAsync(undefined)
              .then(() => {
                setBody('');
                setConfirming(false);
              })
              .catch(() => setConfirming(false));
          }}
        >
          <fieldset className="compose-toggle">
            <legend>À qui s'adresse cet écrit ?</legend>
            <label className="compose-option client">
              <input
                type="radio"
                name="kind"
                checked={kind === 'client_message'}
                onChange={() => {
                  setKind('client_message');
                  setConfirming(false);
                }}
              />
              <span className="co-icon" aria-hidden="true">
                <Send size={17} />
              </span>
              <span>
                <strong>Message au client</strong>
                <span className="cell-sub">Visible dans son suivi, envoyé par le canal choisi.</span>
              </span>
            </label>
            <label className="compose-option internal">
              <input
                type="radio"
                name="kind"
                checked={kind === 'internal_note'}
                onChange={() => {
                  setKind('internal_note');
                  setConfirming(false);
                }}
              />
              <span className="co-icon" aria-hidden="true">
                <Lock size={17} />
              </span>
              <span>
                <strong>Note interne</strong>
                <span className="cell-sub">Équipes BSCA seulement, jamais publiée au client.</span>
              </span>
            </label>
          </fieldset>
          {kind === 'client_message' ? (
            <InfoBox tone="info">Ce message sera visible par le client dans son suivi. Il ne pourra pas être rappelé.</InfoBox>
          ) : (
            <InfoBox tone="warn">
              <InternalBadge /> Cette note reste strictement interne.
            </InfoBox>
          )}
          {send.apiError && <InfoBox tone="danger">{send.apiError.message}</InfoBox>}
          {kind === 'client_message' && (
            <Select label="Canal" options={(ref.data?.channels ?? []).map((x) => ({ value: x.code, label: x.label }))} value={channel} onChange={(e) => setChannel(e.target.value)} />
          )}
          <Textarea
            label={kind === 'internal_note' ? 'Note interne' : 'Message au client'}
            required
            rows={4}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setConfirming(false);
            }}
            error={send.apiError?.fieldErrors.body}
          />
          {confirming && kind === 'client_message' && (
            <div className="confirm-step" role="alert">
              <h3>
                <Send size={16} aria-hidden="true" /> Envoyer ce message au client ?
              </h3>
              <p>Le client le verra dans son suivi{channel ? ` et le recevra par ${(ref.data?.channels ?? []).find((x) => x.code === channel)?.label ?? channel}` : ''}. Un message envoyé ne peut pas être modifié ni rappelé.</p>
            </div>
          )}
          <div className="form-actions">
            {confirming && (
              <Button variant="alt" onClick={() => setConfirming(false)}>
                Revenir au message
              </Button>
            )}
            <Button type="submit" variant={kind === 'internal_note' ? 'blue' : 'primary'} loading={send.isPending} disabled={body.trim().length < 2}>
              {kind === 'internal_note' ? 'Ajouter la note interne' : confirming ? 'Confirmer l\'envoi au client' : 'Envoyer au client'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
