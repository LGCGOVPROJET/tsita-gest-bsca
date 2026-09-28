import {
  BarChart3,
  Clock,
  FilePlus2,
  Gauge,
  Gem,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  PlusCircle,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/types/api';
import { ADMIN_PERMISSIONS, QUALITY_PERMISSIONS, SOLUTION_PERMISSIONS } from '@/lib/permissions';
import { ADMIN_GROUPS, ADMIN_SECTIONS } from '@/features/admin/adminSections';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  anyOf?: Permission[];
  /** Préfixes d'URL qui activent l'élément (le préfixe le plus long l'emporte). */
  match?: string[];
  /** Compteur affiché à côté du libellé. */
  badge?: 'alerts';
  /** Rubrique de la page Paramètres (?onglet=…) : l'élément est actif quand cette rubrique est ouverte. */
  onglet?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  /** Rôles pour lesquels la section n'a pas de sens (ex. espace client pour l'administrateur). */
  hideForRoles?: string[];
}

/** Modules regroupés par métier : pilotage, traitement, qualité, administration, compte, espace client. */
export const NAV: NavSection[] = [
  {
    title: 'Pilotage',
    items: [
      { to: '/app/tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard, anyOf: ['dashboard.view'] },
      { to: '/app/administration', label: 'Administration', icon: Gauge, anyOf: ADMIN_PERMISSIONS },
      { to: '/app/rapports', label: 'Rapports', icon: BarChart3, anyOf: ['reports.view'] },
    ],
  },
  {
    title: 'Traitement des réclamations',
    items: [
      { to: '/app/reclamations', label: 'Réclamations', icon: ListChecks, anyOf: ['complaints.view'], match: ['/app/reclamations'] },
      { to: '/app/reclamations/nouvelle', label: 'Nouvelle réclamation', icon: FilePlus2, anyOf: ['complaints.create'] },
      { to: '/app/delais', label: 'Délais et alertes', icon: Clock, anyOf: ['deadlines.view'], badge: 'alerts' },
      { to: '/app/solutions', label: 'Solutions et validations', icon: Gem, anyOf: SOLUTION_PERMISSIONS },
    ],
  },
  {
    title: 'Qualité et conformité',
    items: [{ to: '/app/qualite', label: 'Qualité et actions', icon: ShieldCheck, anyOf: QUALITY_PERMISSIONS }],
  },
  // Rubriques de Paramètres, regroupées par thème directement dans la barre latérale.
  ...ADMIN_GROUPS.map((group) => ({
    title: group,
    items: ADMIN_SECTIONS.filter((sec) => sec.group === group).map((sec) => ({
      to: `/app/parametres?onglet=${sec.key}`,
      label: sec.label,
      icon: sec.icon,
      anyOf: sec.anyOf,
      onglet: sec.key,
    })),
  })),
  {
    title: 'Mon compte',
    items: [{ to: '/app/securite', label: 'Sécurité du compte', icon: KeyRound }],
  },
  {
    title: 'Espace client',
    hideForRoles: ['admin'],
    items: [
      { to: '/deposer', label: 'Déposer une demande', icon: PlusCircle },
      { to: '/suivi', label: 'Suivre une demande', icon: Search },
    ],
  },
];

/** Élément actif : celui dont le préfixe d'URL correspondant est le plus long (ex. « Nouvelle réclamation » plutôt que « Réclamations »). */
export function activeNavPath(pathname: string, items: NavItem[]): string | null {
  let best: { to: string; len: number } | null = null;
  for (const it of items) {
    if (it.onglet) continue;
    for (const m of it.match ?? [it.to]) {
      if ((pathname === m || pathname.startsWith(`${m}/`)) && (!best || m.length > best.len)) best = { to: it.to, len: m.length };
    }
    if (pathname === it.to && (!best || it.to.length >= best.len)) best = { to: it.to, len: it.to.length };
  }
  return best?.to ?? null;
}
