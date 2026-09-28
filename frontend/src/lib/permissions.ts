import type { Permission, User } from '@/types/api';

/** Le front masque seulement : les règles d'accès sont appliquées côté serveur (§4). */
export function can(user: User | null | undefined, ...perms: Permission[]): boolean {
  if (!user) return false;
  return perms.every((p) => user.permissions.includes(p));
}

export function canAny(user: User | null | undefined, ...perms: Permission[]): boolean {
  if (!user) return false;
  return perms.some((p) => user.permissions.includes(p));
}

export const ADMIN_PERMISSIONS: Permission[] = [
  'admin.users',
  'admin.referentials',
  'admin.rules',
  'admin.rules.validate',
  'admin.audit',
  'admin.imports',
];

export const SOLUTION_PERMISSIONS: Permission[] = ['solutions.propose', 'solutions.approve_n1', 'solutions.approve_n2'];
export const QUALITY_PERMISSIONS: Permission[] = ['quality.manage', 'quality.control'];

export interface AppRoute {
  path: string;
  label: string;
  /** Au moins une de ces permissions. */
  anyOf: Permission[];
}

/** Routes internes dans l'ordre de priorité pour la page d'accueil après connexion. */
export const APP_ROUTES: AppRoute[] = [
  { path: '/app/tableau-de-bord', label: 'Tableau de bord', anyOf: ['dashboard.view'] },
  { path: '/app/reclamations', label: 'Réclamations', anyOf: ['complaints.view'] },
  { path: '/app/delais', label: 'Délais et alertes', anyOf: ['deadlines.view'] },
  { path: '/app/solutions', label: 'Solutions', anyOf: SOLUTION_PERMISSIONS },
  { path: '/app/qualite', label: 'Qualité et actions', anyOf: QUALITY_PERMISSIONS },
  { path: '/app/rapports', label: 'Rapports', anyOf: ['reports.view'] },
  { path: '/app/administration', label: 'Administration', anyOf: ADMIN_PERMISSIONS },
  { path: '/app/parametres', label: 'Paramètres', anyOf: ADMIN_PERMISSIONS },
];

export function homePathFor(user: User | null | undefined): string {
  if (!user) return '/connexion';
  if (user.role === 'client') return '/client';
  const first = APP_ROUTES.find((r) => canAny(user, ...r.anyOf));
  return first?.path ?? '/app/interdit';
}

/**
 * Le profil peut-il ouvrir ce chemin interne ? Sert à ne reprendre une destination mémorisée
 * (?next=…) que si elle est autorisée — sinon l'utilisateur tomberait sur une page 403.
 */
export function canAccessPath(user: User | null | undefined, path: string | null | undefined): boolean {
  if (!user || !path) return false;
  const pathname = path.split(/[?#]/)[0] ?? '';
  if (user.role === 'client') return pathname === '/client' || pathname.startsWith('/client/');
  if (!pathname.startsWith('/app')) return false;
  const route = [...APP_ROUTES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
  // Pages sans permission dédiée (sécurité du compte, accueil /app) : accessibles à tout collaborateur.
  return route ? canAny(user, ...route.anyOf) : true;
}

/** Empêche les redirections ouvertes : seuls les chemins internes relatifs sont acceptés. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}
