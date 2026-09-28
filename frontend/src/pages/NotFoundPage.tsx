import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function NotFoundPage({ inApp = false }: { inApp?: boolean }) {
  useDocumentTitle('Page introuvable');
  return (
    <div className={inApp ? 'status-page in-app' : 'status-page'}>
      {!inApp && <img src="/bsca-wide.png" alt="BSCA Bank — Banque Sino-Congolaise pour l'Afrique" width={220} height={56} />}
      <span className="status-illu" aria-hidden="true">
        <Compass size={34} />
      </span>
      <p className="eyebrow">Erreur 404</p>
      <h1>Cette page est introuvable</h1>
      <p className="sub">L'adresse est peut-être incomplète, ou la page a été déplacée.</p>
      <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
        <Link className="btn" to="/">
          Retour à l'accueil
        </Link>
        <Link className="btn alt" to="/suivi">
          Suivre une demande
        </Link>
      </div>
    </div>
  );
}
