import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, KeyRound, Smartphone } from 'lucide-react';
import { authApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { ME_KEY, useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { InfoBox } from '@/components/ui/InfoBox';
import { QrCode } from '@/components/ui/QrCode';
import { useToast } from '@/components/ui/toast-context';
import type { User } from '@/types/api';

/** Secret TOTP en groupes de 4 pour une saisie manuelle plus sûre. */
function groupSecret(s: string): string {
  return s.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Enrôlement TOTP (RFC 6238) : POST /auth/mfa/setup → QR code local + secret → code → POST /auth/mfa/confirm.
 * Le secret n'est conservé qu'en mémoire, le temps de l'enrôlement.
 */
export function MfaEnrollment({ onDone }: { onDone?: (u: User | null) => void }) {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const setup = useMutation({ mutationFn: authApi.mfaSetup });
  const confirm = useMutation({
    mutationFn: () => authApi.mfaConfirm(code),
    onSuccess: async (u) => {
      toast.success('Double authentification activée. Elle vous sera demandée à chaque connexion.');
      if (u) qc.setQueryData(ME_KEY, u);
      else await refresh();
      setCode('');
      onDone?.(u);
    },
  });

  if (user?.mfa_enabled && !user.mfa_enrollment_required) {
    return (
      <InfoBox tone="success">
        <CheckCircle2 size={15} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> La double authentification est active sur votre compte. Pour la
        réinitialiser (changement de téléphone), contactez l'administrateur.
      </InfoBox>
    );
  }

  const confirmErr = confirm.isError ? toApiError(confirm.error) : null;

  return (
    <div>
      <ol className="mfa-steps">
        <li>
          <Smartphone size={16} aria-hidden="true" /> Installez une application d'authentification (TOTP) sur votre téléphone professionnel.
        </li>
        <li>
          <KeyRound size={16} aria-hidden="true" /> Générez votre clé, puis scannez le QR code ou saisissez la clé.
        </li>
        <li>
          <CheckCircle2 size={16} aria-hidden="true" /> Confirmez avec le code à 6 chiffres affiché par l'application.
        </li>
      </ol>

      {!setup.data ? (
        <>
          {setup.isError && (
            <InfoBox tone="danger" role="alert">
              {toApiError(setup.error).message}
            </InfoBox>
          )}
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <Button onClick={() => setup.mutate()} loading={setup.isPending} icon={<KeyRound size={15} aria-hidden="true" />}>
              Générer ma clé
            </Button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{6}$/.test(code)) confirm.mutate();
          }}
          noValidate
        >
          <div className="mfa-setup">
            <QrCode value={setup.data.otpauth_url} label="QR code à scanner avec votre application d'authentification" />
            <div style={{ minWidth: 0 }}>
              <div className="secret-box">
                <div style={{ minWidth: 0 }}>
                  <div className="secret-label">Clé secrète (saisie manuelle)</div>
                  <div className="secret-value mono" style={{ fontSize: 17 }}>
                    {groupSecret(setup.data.secret)}
                  </div>
                </div>
              </div>
              <p className="caption" style={{ marginTop: 8 }}>
                Sur téléphone : <a href={setup.data.otpauth_url}>ouvrir dans l'application d'authentification</a>. Ne partagez jamais cette clé.
              </p>
              <Input
                label="Code à 6 chiffres"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                hint="Renouvelé toutes les 30 secondes."
                error={confirmErr ? (confirmErr.fieldErrors.code ?? confirmErr.message) : undefined}
              />
              <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
                <Button type="submit" loading={confirm.isPending} disabled={code.length !== 6}>
                  Activer la double authentification
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
