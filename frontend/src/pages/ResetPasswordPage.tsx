import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';
import { authApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { passwordSchema } from '@/lib/validation';

const schema = z
  .object({
    email: z.string().email('Adresse e-mail invalide.'),
    password: passwordSchema,
    password_confirmation: z.string(),
  })
  .refine((v) => v.password === v.password_confirmation, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['password_confirmation'],
  });
type Values = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  useDocumentTitle('Nouveau mot de passe');
  // SEC-24 : jeton et adresse lus une seule fois au montage, conservés en mémoire uniquement,
  // puis retirés immédiatement de la barre d'adresse (historique, journaux de proxy, Referer).
  const [initial] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return { token: p.get('token') ?? '', email: p.get('email') ?? '' };
  });
  const token = initial.token;
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError: setFieldError } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: initial.email, password: '', password_confirmation: '' },
  });

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      await authApi.resetPassword({ token, ...v });
      setDone(true);
    } catch (e) {
      const err = toApiError(e);
      for (const [k, m] of Object.entries(err.fieldErrors)) {
        if (k === 'email' || k === 'password' || k === 'password_confirmation') setFieldError(k, { message: m });
      }
      setError(err.fieldErrors.token ?? err.message);
    }
  };

  return (
    <div className="login-page" style={{ gridTemplateColumns: '1fr' }}>
      {/* React 19 place cette balise dans <head> le temps de l'affichage de la page. */}
      <meta name="referrer" content="no-referrer" />
      <main className="login-main" id="contenu">
        <div className="loginbox">
          <img src="/bsca-wide.png" alt="BSCA Bank — Banque Sino-Congolaise pour l'Afrique" width={236} height={60} />
          <h1>Définir un nouveau mot de passe</h1>
          {!token && <InfoBox tone="danger">Lien incomplet ou expiré. Refaites une demande depuis la page de connexion.</InfoBox>}
          {done ? (
            <>
              <InfoBox tone="success" role="status">
                Votre mot de passe a été modifié. Vous pouvez vous connecter.
              </InfoBox>
              <Link className="btn block" to="/connexion">
                Aller à la connexion
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <div role="alert">{error && <InfoBox tone="danger">{error}</InfoBox>}</div>
              <Input label="Adresse e-mail" type="email" autoComplete="username" required error={formState.errors.email?.message} {...register('email')} />
              <Input
                label="Nouveau mot de passe"
                type="password"
                autoComplete="new-password"
                required
                hint="12 caractères minimum, avec majuscule, minuscule, chiffre et symbole."
                error={formState.errors.password?.message}
                {...register('password')}
              />
              <Input
                label="Confirmer le mot de passe"
                type="password"
                autoComplete="new-password"
                required
                error={formState.errors.password_confirmation?.message}
                {...register('password_confirmation')}
              />
              <Button type="submit" className="block" loading={formState.isSubmitting} disabled={!token}>
                Enregistrer
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
