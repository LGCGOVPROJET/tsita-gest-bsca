import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Eye, EyeOff, FileSearch, KeyRound, Lock, PlusCircle, ShieldCheck } from 'lucide-react';
import { Tabs } from '@/components/ui/Tabs';
import { tabPanelProps } from '@/components/ui/tabPanel';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';
import { useAuth } from '@/lib/auth-context';
import { homePathFor, safeNext, canAccessPath } from '@/lib/permissions';
import { authApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type Space = 'collaborateur' | 'client';

const schema = z.object({
  email: z.string().trim().min(1, 'Saisissez votre adresse e-mail.').email('Adresse e-mail invalide.'),
  password: z.string().min(1, 'Saisissez votre mot de passe.'),
  mfa_code: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  useDocumentTitle('Connexion');
  const { user, loading, login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [space, setSpace] = useState<Space>(params.get('espace') === 'client' ? 'client' : 'collaborateur');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<{ message: string; tone: 'danger' | 'warn' } | null>(null);
  const [lockSeconds, setLockSeconds] = useState(0);
  const [forgot, setForgot] = useState(false);
  const mfaRef = useRef<HTMLInputElement | null>(null);
  const expired = params.get('expire') === '1';
  const next = safeNext(params.get('next'));

  const { register, handleSubmit, formState, setValue, getValues } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', mfa_code: '' },
  });

  useEffect(() => {
    if (lockSeconds <= 0) return;
    const t = setInterval(() => setLockSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockSeconds]);

  useEffect(() => {
    if (mfaRequired) mfaRef.current?.focus();
  }, [mfaRequired]);

  if (!loading && user) {
    return <Navigate to={canAccessPath(user, next) ? next! : homePathFor(user)} replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setError(null);
    if (mfaRequired && !/^\d{6}$/.test(values.mfa_code ?? '')) {
      setError({ message: 'Saisissez le code à 6 chiffres de votre application.', tone: 'danger' });
      return;
    }
    try {
      const res = await login({
        email: values.email.trim(),
        password: values.password,
        mfa_code: mfaRequired ? values.mfa_code : undefined,
      });
      if ('mfa_required' in res && res.mfa_required) {
        setMfaRequired(true);
        return;
      }
      if ('data' in res) {
        const u = res.data;
        if (u.mfa_enrollment_required) {
          navigate('/securite/mfa', { replace: true });
          return;
        }
        navigate(canAccessPath(u, next) ? next! : homePathFor(u), { replace: true });
      }
    } catch (e) {
      const err = toApiError(e);
      if (err.status === 429) {
        setLockSeconds(err.retryAfter ?? 60);
        setError({
          message: `Trop de tentatives de connexion. Réessayez dans ${err.retryAfter ?? 60} secondes.`,
          tone: 'warn',
        });
      } else if (err.status === 423 || /verrouill/i.test(err.message)) {
        setError({
          message:
            'Votre compte est temporairement verrouillé après plusieurs échecs (15 minutes). Réessayez plus tard ou utilisez « Mot de passe oublié ».',
          tone: 'warn',
        });
      } else if (err.status === 422 || err.status === 401) {
        if (mfaRequired && (err.fieldErrors.mfa_code || /code/i.test(err.message))) {
          setError({ message: 'Code de vérification incorrect ou expiré.', tone: 'danger' });
          setValue('mfa_code', '');
        } else {
          // Message volontairement discret : ne révèle pas si le compte existe.
          setError({ message: 'Adresse e-mail ou mot de passe incorrect.', tone: 'danger' });
        }
      } else {
        setError({ message: err.message, tone: 'danger' });
      }
    }
  };

  const mfaReg = register('mfa_code');

  return (
    <div className="login-page">
      <aside className="login-aside" aria-hidden="true">
        <div className="brand-line">
          <img src="/bsca-mark.png" alt="" width={46} height={46} />
          <div>
            <strong>TSITA GEST</strong>
            <small>POUR BSCA BANK</small>
          </div>
        </div>
        <div>
          <div className="eyebrow">TSITA GEST × BSCA Bank</div>
          <h2>Chaque demande mérite une réponse claire.</h2>
          <p>Un parcours unique, depuis la réception jusqu'à la solution et au contrôle de sa mise en œuvre.</p>
          <ul className="login-points">
            <li>
              <CheckCircle2 size={18} /> Dossiers tracés et horodatés
            </li>
            <li>
              <ShieldCheck size={18} /> Accès par rôle et par périmètre
            </li>
            <li>
              <Lock size={18} /> Notes internes jamais visibles du client
            </li>
          </ul>
        </div>
        <small style={{ color: 'var(--side-muted)' }}>Environnement de démonstration · données fictives</small>
      </aside>

      <main className="login-main" id="contenu">
        <div className="loginbox">
          <img src="/bsca-wide.png" alt="BSCA Bank — Banque Sino-Congolaise pour l'Afrique" width={236} height={60} />
          <h1>Accéder à TSITA GEST</h1>
          <p className="sub">Plateforme de gestion des réclamations de BSCA Bank.</p>

          <Tabs<Space>
            label="Type d'accès"
            idPrefix="login"
            active={space}
            onChange={(k) => {
              setSpace(k);
              setError(null);
              setForgot(false);
            }}
            tabs={[
              { key: 'collaborateur', label: 'Collaborateur' },
              { key: 'client', label: 'Client' },
            ]}
          />

          <div {...tabPanelProps('login', space)} tabIndex={-1}>
            {expired && !error && (
              <InfoBox tone="warn" role="status">
                Votre session a expiré après une période d'inactivité. Reconnectez-vous pour continuer.
              </InfoBox>
            )}

            {space === 'client' && !forgot && (
              <div className="client-access">
                <Link to="/deposer">
                  <span className="ca-icon" aria-hidden="true">
                    <PlusCircle size={19} />
                  </span>
                  <span>
                    <b>Déposer une réclamation</b>
                    <span className="caption">Sans compte, en quelques étapes.</span>
                  </span>
                </Link>
                <Link to="/suivi">
                  <span className="ca-icon" aria-hidden="true">
                    <FileSearch size={19} />
                  </span>
                  <span>
                    <b>Suivre ma demande</b>
                    <span className="caption">Avec votre référence et votre code de suivi.</span>
                  </span>
                </Link>
                <p className="caption" style={{ margin: '4px 0 0' }}>
                  Vous disposez d'un compte client ? Connectez-vous ci-dessous.
                </p>
              </div>
            )}

            {forgot ? (
              <ForgotPassword defaultEmail={getValues('email')} onBack={() => setForgot(false)} />
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div role="alert" aria-live="assertive">
                  {error && <InfoBox tone={error.tone}>{error.message}</InfoBox>}
                </div>
                <Input
                  label={space === 'collaborateur' ? 'Adresse professionnelle' : 'Adresse e-mail'}
                  type="email"
                  autoComplete="username"
                  placeholder={space === 'collaborateur' ? 'prenom.nom@bsca.cg' : 'nom@exemple.cg'}
                  required
                  error={formState.errors.email?.message}
                  disabled={mfaRequired}
                  {...register('email')}
                />
                <div className="password-wrap-field">
                  <Input
                    label="Mot de passe"
                    type={showPwd ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    error={formState.errors.password?.message}
                    disabled={mfaRequired}
                    className="password-wrap"
                    {...register('password')}
                  />
                </div>
                <div className="row" style={{ marginTop: -6 }}>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setShowPwd((s) => !s)}
                    aria-pressed={showPwd}
                    style={{ fontSize: 'var(--fs-xs)' }}
                  >
                    {showPwd ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{' '}
                    {showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  </button>
                </div>

                {mfaRequired && (
                  <>
                    <InfoBox tone="info">
                      <KeyRound size={15} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Votre profil exige une double
                      authentification. Saisissez le code affiché dans votre application.
                    </InfoBox>
                    <Input
                      label="Code de vérification"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="123456"
                      required
                      hint="6 chiffres, renouvelé toutes les 30 secondes."
                      {...mfaReg}
                      ref={(el) => {
                        mfaReg.ref(el);
                        mfaRef.current = el;
                      }}
                    />
                  </>
                )}

                <Button type="submit" className="block" loading={formState.isSubmitting} disabled={lockSeconds > 0}>
                  {lockSeconds > 0 ? `Patientez ${lockSeconds} s` : mfaRequired ? 'Vérifier et se connecter' : 'Se connecter'}
                </Button>

                <div className="login-links">
                  <button type="button" className="link-btn" onClick={() => setForgot(true)}>
                    Mot de passe oublié ?
                  </button>
                  {mfaRequired ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setMfaRequired(false);
                        setValue('mfa_code', '');
                        setError(null);
                      }}
                    >
                      Changer de compte
                    </button>
                  ) : (
                    <span className="caption">Besoin d'aide ? Contactez votre administrateur.</span>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function ForgotPassword({ defaultEmail, onBack }: { defaultEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(defaultEmail);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          setErr('Adresse e-mail invalide.');
          return;
        }
        setBusy(true);
        try {
          await authApi.forgotPassword(email.trim());
        } catch (e2) {
          const a = toApiError(e2);
          if (a.status === 429) {
            setErr(a.message);
            setBusy(false);
            return;
          }
        }
        // Message neutre, identique que le compte existe ou non.
        setSent('Si un compte correspond à cette adresse, un lien de réinitialisation vient de vous être envoyé.');
        setBusy(false);
      }}
      noValidate
    >
      <h2 style={{ marginTop: 14 }}>Mot de passe oublié</h2>
      <p className="sub">Indiquez votre adresse : vous recevrez un lien pour définir un nouveau mot de passe.</p>
      <div role="status" aria-live="polite">
        {sent && <InfoBox tone="success">{sent}</InfoBox>}
      </div>
      <Input
        label="Adresse e-mail"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={err ?? undefined}
      />
      <Button type="submit" className="block" loading={busy} disabled={Boolean(sent)}>
        Envoyer le lien
      </Button>
      <div className="login-links">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Retour à la connexion
        </button>
      </div>
    </form>
  );
}
