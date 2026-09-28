import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { KeyRound, LogOut, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { initials } from '@/lib/format';
import { useToast } from '@/components/ui/toast-context';

export function Topbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const doLogout = async () => {
    setMenu(false);
    await logout();
    toast.show('Vous êtes déconnecté.');
    navigate('/connexion', { replace: true });
  };

  return (
    <header className="top">
      <Link to="/app" className="top-logo" aria-label="Accueil TSITA GEST">
        <img src="/bsca-wide.png" alt="BSCA Bank — Banque Sino-Congolaise pour l'Afrique" width={181} height={46} />
      </Link>
      <div className="top-right">
        {can(user, 'complaints.view') && (
          <button
            type="button"
            className="quick-search"
            onClick={onOpenSearch}
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
            aria-label="Recherche rapide"
          >
            <Search size={16} aria-hidden="true" />
            <span className="qs-label">Rechercher une référence…</span>
            <kbd aria-hidden="true">{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
        )}
        {user && <span className="pill">Espace {user.role_label.toLowerCase()}</span>}
        <div className="user-menu" ref={ref}>
          <button
            type="button"
            className="avatar"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label={`Menu du compte ${user?.name ?? ''}`}
            onClick={() => setMenu((m) => !m)}
          >
            {initials(user?.name)}
          </button>
          {menu && user && (
            <div className="menu-pop" role="menu" aria-label="Compte">
              <div className="menu-head">
                <b>{user.name}</b>
                <span className="caption">{user.email}</span>
                <br />
                <span className="caption">
                  {user.role_label}
                  {user.agency ? ` · ${user.agency.name}` : ''}
                  {user.entity ? ` · ${user.entity.name}` : ''}
                </span>
              </div>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setMenu(false);
                  navigate('/app/securite');
                }}
              >
                <KeyRound size={16} aria-hidden="true" />
                Sécurité du compte
                <span className="caption" style={{ marginLeft: 'auto' }}>
                  {user.mfa_enabled ? 'MFA active' : 'MFA inactive'}
                </span>
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={doLogout}>
                <LogOut size={16} aria-hidden="true" />
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
