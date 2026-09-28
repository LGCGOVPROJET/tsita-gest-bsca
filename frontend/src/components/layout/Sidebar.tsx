import { Link, useLocation, useSearchParams } from 'react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readUiPref, writeUiPref } from '@/lib/uiPrefs';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { deadlinesApi } from '@/api/endpoints';
import { useAuth } from '@/lib/auth-context';
import { canAny } from '@/lib/permissions';
import { formatNumber } from '@/lib/format';
import { NAV, activeNavPath } from './navItems';

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

/** Compteur d'alertes (à risque + en retard), rafraîchi toutes les 2 minutes. */
function useAlertCount(enabled: boolean) {
  return useQuery({
    queryKey: ['nav-alerts'],
    queryFn: async () => {
      const r = await deadlinesApi.list({ queue: 'en_retard', per_page: '1' });
      return (r.summary?.en_retard ?? 0) + (r.summary?.a_risque ?? 0);
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const alerts = useAlertCount(canAny(user, 'deadlines.view'));
  const sections = NAV.filter((s) => !user || !s.hideForRoles?.includes(user.role))
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.anyOf || canAny(user, ...it.anyOf)) }))
    .filter((s) => s.items.length);
  const allItems = sections.flatMap((s) => s.items);
  const active = activeNavPath(pathname, allItems);
  // Rubrique de Paramètres ouverte : celle de l'adresse, sinon la première autorisée (comportement de la page).
  const [params] = useSearchParams();
  const settingsItems = allItems.filter((it) => it.onglet);
  const onglet =
    pathname === '/app/parametres'
      ? (settingsItems.find((it) => it.onglet === params.get('onglet'))?.onglet ?? settingsItems[0]?.onglet)
      : null;

  const sectionHasActive = (section: (typeof sections)[number]) =>
    section.items.some((it) => (it.onglet ? it.onglet === onglet : active === it.to));
  const isFolded = (section: (typeof sections)[number]) => folded.includes(section.title) && !sectionHasActive(section);
  const sectionId = (title: string) =>
    `nav-${title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z]+/g, '-')}`;

  // Catégories repliées (préférence d'affichage) ; celle de la page ouverte reste toujours dépliée.
  const [folded, setFolded] = useState<string[]>(() => (readUiPref('sidebar.folded') ?? '').split('|').filter(Boolean));
  const toggleSection = (title: string) => {
    const next = folded.includes(title) ? folded.filter((t) => t !== title) : [...folded, title];
    setFolded(next);
    writeUiPref('sidebar.folded', next.join('|'));
  };

  return (
    <aside className="side" aria-label="Barre latérale">
      <Link to="/app" className="brand" aria-label="TSITA GEST pour BSCA Bank — accueil">
        <img src="/bsca-mark.png" alt="" width={39} height={39} />
        <div className="brand-text">
          <strong>TSITA GEST</strong>
          <small>POUR BSCA BANK</small>
        </div>
      </Link>
      <nav aria-label="Navigation principale">
        {sections.map((section) => (
          <div key={section.title} className={`side-section${isFolded(section) ? ' is-folded' : ''}`}>
            <button
              type="button"
              className="side-title"
              aria-expanded={!isFolded(section)}
              aria-controls={sectionId(section.title)}
              onClick={() => toggleSection(section.title)}
              disabled={sectionHasActive(section)}
              title={sectionHasActive(section) ? 'Catégorie de la page ouverte' : isFolded(section) ? 'Déplier' : 'Replier'}
            >
              <span>{section.title}</span>
              <ChevronDown size={14} aria-hidden="true" className="side-chevron" />
            </button>
            <ul id={sectionId(section.title)}>
              {section.items.map((it) => {
                const Icon = it.icon;
                const isActive = it.onglet ? it.onglet === onglet : active === it.to;
                const count = it.badge === 'alerts' ? alerts.data : undefined;
                return (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      className={`nav ${isActive ? 'active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      title={it.label}
                    >
                      <span className="icon" aria-hidden="true">
                        <Icon size={19} strokeWidth={2} />
                      </span>
                      <span className="navtext">{it.label}</span>
                      {count ? (
                        <span className="nav-badge" aria-label={`${formatNumber(count)} dossiers à risque ou en retard`}>
                          {count > 99 ? '99+' : count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {user && (
        <div className="side-footer">
          <b>{user.name}</b>
          {user.role_label}
          {user.agency && <> · {user.agency.name}</>}
          {user.entity && <> · {user.entity.name}</>}
          <br />
          Données de démonstration fictives.
        </div>
      )}
      {onToggle && (
        <button
          type="button"
          className="side-toggle"
          onClick={onToggle}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
        >
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          <span className="navtext">{collapsed ? 'Déplier' : 'Replier le menu'}</span>
        </button>
      )}
    </aside>
  );
}
