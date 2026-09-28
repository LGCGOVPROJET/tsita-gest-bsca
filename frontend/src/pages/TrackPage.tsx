import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { publicApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDuration } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ClientComplaintView } from '@/features/public/ClientComplaintView';
import { MessageForm, ReopenAction, UploadForm, type ComplaintOps } from '@/features/public/ComplaintActions';

interface Creds {
  reference: string;
  tracking_code: string;
}

const REF_RE = /^TG-BSCA-\d{4}-\d{4,6}$/i;

export default function TrackPage() {
  useDocumentTitle('Suivre ma demande');
  const [params] = useSearchParams();
  const [reference, setReference] = useState(params.get('reference') ?? '');
  const [code, setCode] = useState('');
  const [fieldErr, setFieldErr] = useState<{ reference?: string; code?: string }>({});
  // Identifiants gardés en mémoire uniquement (jamais dans le stockage du navigateur).
  const [creds, setCreds] = useState<Creds | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const view = useQuery({
    queryKey: ['track', creds?.reference],
    queryFn: () => publicApi.track(creds!.reference, creds!.tracking_code),
    enabled: Boolean(creds),
    staleTime: 15_000,
  });

  const lookup = async (rawRef: string, rawCode: string) => {
    setLoginError(null);
    const ref = rawRef.trim().toUpperCase();
    const c = rawCode.trim().toUpperCase();
    const errs: typeof fieldErr = {};
    if (!REF_RE.test(ref)) errs.reference = 'Format attendu : TG-BSCA-AAAA-NNNNNN.';
    if (c.length !== 8) errs.code = 'Le code de suivi comporte 8 caractères.';
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const data = await publicApi.track(ref, c);
      qc.setQueryData(['track', ref], data);
      setCreds({ reference: ref, tracking_code: c });
    } catch (err) {
      const a = toApiError(err);
      if (a.status === 429)
        setLoginError(
          a.retryAfter
            ? `Trop de tentatives pour ce dossier : l'accès est temporairement bloqué par sécurité. Réessayez dans ${formatDuration(a.retryAfter)}.`
            : a.message || 'Trop de tentatives. Réessayez plus tard.',
        );
      else if (a.status === 404 || a.status === 422 || a.status === 401 || a.status === 403)
        setLoginError('Référence ou code de suivi incorrect. Vérifiez votre saisie (lettres majuscules, sans espace).');
      else setLoginError(a.message);
    } finally {
      setBusy(false);
    }
  };

  const onLookup = (e: React.FormEvent) => {
    e.preventDefault();
    void lookup(reference, code);
  };

  // Suivi rapide depuis l'accueil : identifiants reçus via l'état de navigation (jamais dans l'URL),
  // consommés une seule fois puis effacés de l'historique.
  const location = useLocation();
  const navigate = useNavigate();
  const consumed = useRef(false);
  useEffect(() => {
    const st = location.state as Partial<Creds> | null;
    if (consumed.current || !st?.reference || !st.tracking_code) return;
    consumed.current = true;
    setReference(st.reference);
    setCode(st.tracking_code);
    navigate(location.pathname, { replace: true, state: null });
    void lookup(st.reference, st.tracking_code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ops: ComplaintOps | null = creds
    ? {
        sendMessage: (b) => publicApi.sendMessage(creds.reference, creds.tracking_code, b),
        upload: (f) => publicApi.uploadAttachment(creds.reference, creds.tracking_code, f),
        reopen: (r) => publicApi.reopen(creds.reference, creds.tracking_code, r),
        refresh: () => qc.invalidateQueries({ queryKey: ['track', creds.reference] }),
      }
    : null;

  const leave = () => {
    setCreds(null);
    setCode('');
    qc.removeQueries({ queryKey: ['track'] });
  };

  return (
    <>
      <PageHeader
        eyebrow="Espace client"
        title="Suivre ma demande"
        sub="Consultez l'avancement de votre réclamation, échangez avec nos équipes et ajoutez des documents."
        actions={
          creds && (
            <Button variant="alt" icon={<LogOut size={15} aria-hidden="true" />} onClick={leave}>
              Quitter le suivi
            </Button>
          )
        }
      />

      {!creds ? (
        <div className="twocol">
          <Card title="Accéder à votre dossier">
            <form onSubmit={onLookup} noValidate>
              <div role="alert" aria-live="assertive">
                {loginError && <InfoBox tone="danger">{loginError}</InfoBox>}
              </div>
              <Input
                label="Référence"
                required
                placeholder="TG-BSCA-2026-000123"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                error={fieldErr.reference}
              />
              <Input
                label="Code de suivi"
                required
                placeholder="8 caractères"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={8}
                hint="Communiqué une seule fois lors du dépôt."
                value={code}
                onChange={(e) => setCode(e.target.value)}
                error={fieldErr.code}
                className="mono-input"
              />
              <div className="form-actions">
                <Button type="submit" loading={busy}>
                  Consulter ma demande
                </Button>
              </div>
            </form>
          </Card>
          <Card title="Vous n'avez plus votre code ?">
            <p>Pour protéger vos données, le code de suivi ne peut pas être renvoyé. Contactez votre agence ou le centre de contact BSCA Bank avec votre référence et une pièce d'identité.</p>
            <InfoBox tone="info">Les notes internes de nos équipes ne sont jamais publiées dans ce suivi.</InfoBox>
          </Card>
        </div>
      ) : view.isPending ? (
        <SkeletonCard lines={8} />
      ) : view.isError ? (
        <Card>
          <InfoBox tone="danger" role="alert">
            {toApiError(view.error).message}
          </InfoBox>
          <Button variant="alt" onClick={leave}>
            Revenir à la saisie
          </Button>
        </Card>
      ) : (
        <ClientComplaintView
          v={view.data}
          actions={<ReopenAction ops={ops!} canReopen={view.data.can_reopen} />}
          messagesActions={<MessageForm ops={ops!} />}
          docsActions={<UploadForm ops={ops!} />}
        />
      )}
    </>
  );
}
