import { Navigate, useNavigate } from 'react-router';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { homePathFor } from '@/lib/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';
import { PageSkeleton } from '@/components/layout/PageSkeleton';
import { MfaEnrollment } from '@/features/auth/MfaEnrollment';

/** Écran d'enrôlement imposé (SEC-01) : aucune autre route n'est accessible tant que la MFA n'est pas confirmée. */
export default function MfaEnrollmentPage() {
  useDocumentTitle('Double authentification obligatoire');
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) return <PageSkeleton />;
  if (!user) return <Navigate to="/connexion?next=%2Fsecurite%2Fmfa" replace />;
  if (!user.mfa_enrollment_required) return <Navigate to={homePathFor(user)} replace />;

  return (
    <div className="login-page" style={{ gridTemplateColumns: '1fr' }}>
      <main className="login-main" id="contenu">
        <div className="loginbox" style={{ width: 'min(720px, 100%)' }}>
          <img src="/bsca-wide.png" alt="BSCA Bank — Banque Sino-Congolaise pour l'Afrique" width={236} height={60} />
          <h1>
            <ShieldCheck size={24} aria-hidden="true" style={{ verticalAlign: '-4px', color: 'var(--blue)' }} /> Double authentification obligatoire
          </h1>
          <InfoBox tone="warn" role="note">
            Votre profil <strong>{user.role_label}</strong> exige une double authentification. Configurez-la pour accéder à TSITA GEST.
          </InfoBox>
          <MfaEnrollment onDone={(u) => navigate(homePathFor(u ?? { ...user, mfa_enrollment_required: false }), { replace: true })} />
          <div className="login-links">
            <span className="caption">Connecté en tant que {user.email}</span>
            <Button
              variant="text"
              icon={<LogOut size={15} aria-hidden="true" />}
              onClick={async () => {
                await logout();
                navigate('/connexion', { replace: true });
              }}
            >
              Se déconnecter
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
