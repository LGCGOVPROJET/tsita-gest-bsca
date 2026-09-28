import {
  Building2,
  CalendarDays,
  FileSpreadsheet,
  FileText,
  Network,
  Package,
  Scale,
  ScrollText,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/types/api';

export type AdminTabKey =
  'utilisateurs' | 'agences' | 'entites' | 'categories' | 'produits' | 'regles' | 'feries' | 'modeles' | 'audit' | 'imports';

export interface AdminSection {
  key: AdminTabKey;
  label: string;
  icon: LucideIcon;
  /** Au moins une de ces permissions (mêmes règles côté serveur). */
  anyOf: Permission[];
  /** Groupe d'affichage dans la barre latérale. */
  group: 'Comptes et sécurité' | 'Référentiels' | 'Règles et calendrier' | 'Données';
}

/** Rubriques d'administration : source unique pour la barre latérale, la page Paramètres et les accès rapides. */
export const ADMIN_SECTIONS: AdminSection[] = [
  { key: 'utilisateurs', label: 'Utilisateurs', icon: Users, anyOf: ['admin.users'], group: 'Comptes et sécurité' },
  { key: 'audit', label: "Journal d'audit", icon: ScrollText, anyOf: ['admin.audit'], group: 'Comptes et sécurité' },
  { key: 'agences', label: 'Agences', icon: Building2, anyOf: ['admin.referentials'], group: 'Référentiels' },
  { key: 'entites', label: 'Entités de traitement', icon: Network, anyOf: ['admin.referentials'], group: 'Référentiels' },
  { key: 'categories', label: 'Catégories', icon: Tags, anyOf: ['admin.referentials'], group: 'Référentiels' },
  { key: 'produits', label: 'Produits', icon: Package, anyOf: ['admin.referentials'], group: 'Référentiels' },
  { key: 'modeles', label: 'Modèles de réponse', icon: FileText, anyOf: ['admin.referentials'], group: 'Référentiels' },
  { key: 'regles', label: 'Règles de délai', icon: Scale, anyOf: ['admin.rules', 'admin.rules.validate'], group: 'Règles et calendrier' },
  { key: 'feries', label: 'Jours fériés', icon: CalendarDays, anyOf: ['admin.referentials', 'admin.rules'], group: 'Règles et calendrier' },
  { key: 'imports', label: 'Imports historiques', icon: FileSpreadsheet, anyOf: ['admin.imports'], group: 'Données' },
];

export const ADMIN_GROUPS: AdminSection['group'][] = ['Comptes et sécurité', 'Référentiels', 'Règles et calendrier', 'Données'];
