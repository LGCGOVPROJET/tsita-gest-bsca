import { Link } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/lib/auth-context';
import { homePathFor } from '@/lib/permissions';

export function ForbiddenPage() {
  useDocumentTitle('Accès refusé');
  const { user } = useAuth();
  const home = user ? homePathFor(user) : '/';
  return (
    <div className="status-page in-app">
      <span className="status-illu danger" aria-hidden="true">
        <ShieldAlert size={34} />
      </span>
      <p className="eyebrow">Erreur 403</p>
      <h1>Accès non autorisé</h1>
      <p className="sub">
        Votre profil ne permet pas d'afficher cette page. Si vous pensez qu'il s'agit d'une erreur, contactez l'administrateur fonctionnel.
      </p>
      <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
        <Link className="btn" to={home === '/app/interdit' ? '/' : home}>
          Retour à mon espace
        </Link>
      </div>
    </div>
  );
}
