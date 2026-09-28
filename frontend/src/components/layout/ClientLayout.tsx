import { Suspense } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { House, LogIn, LogOut, PlusCircle, Search, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { PageSkeleton } from './PageSkeleton';
import { useRouteFocus } from '@/hooks/useRouteFocus';

/** Layout du portail client : même charte, sans barre latérale interne. */
export function ClientLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isClient = user?.role === 'client';
  useRouteFocus();

  return (
    <div className="client-shell">
      <a href="#contenu" className="skip-link">
        Aller au contenu principal
      </a>
      <header className="client-top">
        <Link to="/" aria-label="BSCA Bank — Accueil du service réclamations">
          <img src="/bsca-wide.png" alt="BSCA Bank — Banque Sino-Congolaise pour l'Afrique" width={181} height={46} />
        </Link>
        <nav className="client-nav" aria-label="Espace client">
          <NavLink to="/" end>
            <House size={16} aria-hidden="true" /> Accueil
          </NavLink>
          <NavLink to="/deposer">
            <PlusCircle size={16} aria-hidden="true" /> Déposer une réclamation
          </NavLink>
          <NavLink to="/suivi">
            <Search size={16} aria-hidden="true" /> Suivre ma demande
          </NavLink>
          {isClient ? (
            <>
              <NavLink to="/client" end>
                <UserRound size={16} aria-hidden="true" /> Mes réclamations
              </NavLink>
              <a
                href="/connexion"
                onClick={async (e) => {
                  e.preventDefault();
                  await logout();
                  navigate('/connexion', { replace: true });
                }}
              >
                <LogOut size={16} aria-hidden="true" /> Se déconnecter
              </a>
            </>
          ) : user ? (
            <NavLink to="/app">
              <UserRound size={16} aria-hidden="true" /> Espace collaborateur
            </NavLink>
          ) : (
            <NavLink to="/connexion">
              <LogIn size={16} aria-hidden="true" /> Se connecter
            </NavLink>
          )}
        </nav>
      </header>
      <div className="client-band" aria-hidden="true" />
      <main className="client-content" id="contenu" tabIndex={-1}>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="client-footer">
        <span>© BSCA Bank — Banque Sino-Congolaise pour l'Afrique · République du Congo</span>
        <span>Plateforme TSITA GEST · Environnement de démonstration, données fictives</span>
      </footer>
    </div>
  );
}
