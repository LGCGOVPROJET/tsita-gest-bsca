import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { apiEvents } from '@/api/client';
import { ME_KEY } from '@/lib/auth-context';
import { useToast } from '@/components/ui/toast-context';
import type { User } from '@/types/api';
import { formatDuration } from '@/lib/format';

/** Traduit les erreurs HTTP globales (401, 429, 5xx, réseau) en navigation et toasts. */
export function ApiEventsBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    const onUnauthorized = () => {
      const wasLogged = Boolean(qc.getQueryData(ME_KEY));
      qc.setQueryData(ME_KEY, null);
      const path = window.location.pathname;
      if (path.startsWith('/app') || path.startsWith('/client')) {
        const next = encodeURIComponent(path + window.location.search);
        navigate(`/connexion?next=${next}${wasLogged ? '&expire=1' : ''}`, { replace: true });
      }
    };
    const onRate = (e: Event) => {
      const s = (e as CustomEvent<{ retryAfter: number | null }>).detail?.retryAfter;
      toast.warn(s ? `Trop de requêtes. Réessayez dans ${formatDuration(s)}.` : 'Trop de requêtes. Patientez quelques instants.');
    };
    const onMfaEnrollment = () => {
      const me = qc.getQueryData<User | null>(ME_KEY);
      if (me && !me.mfa_enrollment_required) qc.setQueryData(ME_KEY, { ...me, mfa_enrollment_required: true });
      if (window.location.pathname !== '/securite/mfa') navigate('/securite/mfa', { replace: true });
    };
    const onServer = () => toast.error('Le serveur a rencontré une erreur. Réessayez dans un instant.');
    const onNetwork = () => toast.error('Connexion au serveur impossible. Vérifiez votre réseau.');

    apiEvents.addEventListener('unauthorized', onUnauthorized);
    apiEvents.addEventListener('mfa-enrollment-required', onMfaEnrollment);
    apiEvents.addEventListener('rate-limited', onRate);
    apiEvents.addEventListener('server-error', onServer);
    apiEvents.addEventListener('network-error', onNetwork);
    return () => {
      apiEvents.removeEventListener('unauthorized', onUnauthorized);
      apiEvents.removeEventListener('mfa-enrollment-required', onMfaEnrollment);
      apiEvents.removeEventListener('rate-limited', onRate);
      apiEvents.removeEventListener('server-error', onServer);
      apiEvents.removeEventListener('network-error', onNetwork);
    };
  }, [navigate, qc, toast]);

  // Déplace le focus sur le contenu principal à chaque changement de page (lecteurs d'écran).
  useEffect(() => {
    const main = document.getElementById('contenu');
    if (main && document.activeElement !== main && !document.querySelector('[role="dialog"]')) {
      main.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  return null;
}
