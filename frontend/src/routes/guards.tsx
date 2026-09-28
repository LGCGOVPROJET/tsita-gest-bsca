import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/lib/auth-context';
import { canAny, homePathFor } from '@/lib/permissions';
import { useToast } from '@/components/ui/toast-context';
import type { Permission } from '@/types/api';
import { PageSkeleton } from '@/components/layout/PageSkeleton';
import { ForbiddenPage } from '@/pages/ForbiddenPage';

/** Exige une session collaborateur ; les clients sont renvoyés vers leur espace. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/connexion?next=${next}`} replace />;
  }
  if (user.mfa_enrollment_required) return <Navigate to="/securite/mfa" replace />;
  if (user.role === 'client') return <Navigate to="/client" replace />;
  return <>{children}</>;
}

export function RequireClient({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (!user) return <Navigate to={`/connexion?espace=client&next=${encodeURIComponent(location.pathname)}`} replace />;
  if (user.mfa_enrollment_required) return <Navigate to="/securite/mfa" replace />;
  if (user.role !== 'client') return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/**
 * Garde de permission : un profil qui ouvre une page réservée est ramené vers son propre espace
 * (avec un message discret). La page 403 n'est affichée que s'il n'existe aucune page autorisée.
 */
export function RequirePermission({ anyOf, children }: { anyOf: Permission[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!canAny(user, ...anyOf)) return <RedirectToHome />;
  return <>{children}</>;
}

function RedirectToHome() {
  const { user } = useAuth();
  const toast = useToast();
  const home = homePathFor(user);
  const noPage = home === '/app/interdit';
  useEffect(() => {
    if (!noPage) toast.show('Cette page est réservée à un autre profil : vous avez été redirigé vers votre espace.', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (noPage) return <ForbiddenPage />;
  return <Navigate to={home} replace />;
}

function FullPageLoading() {
  return (
    <div style={{ padding: 34 }}>
      <PageSkeleton />
    </div>
  );
}
