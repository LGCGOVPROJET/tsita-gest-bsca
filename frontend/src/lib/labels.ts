/** Libellés FR des énumérations (§4, §5, §6). Servent de repli si l'API ne fournit pas le libellé. */
import type {
  AckStatus,
  Classification,
  ComplaintStatus,
  ControlResult,
  Decision,
  DeadlineFlag,
  DeadlineStatus,
  Priority,
  QualityActionStatus,
  ReplyChannel,
  RiskLevel,
  Role,
  RuleKind,
  RuleSourceType,
  RuleStatus,
  RuleUnit,
  ScanStatus,
  SolutionStatus,
  SolutionType,
  TaskStatus,
  TemplateKind,
  Visibility,
} from '@/types/api';

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  brouillon: 'Brouillon',
  recu: 'Reçu',
  a_qualifier: 'À qualifier',
  affecte: 'Affecté',
  en_investigation: 'En investigation',
  attente_information: "Attente d'information",
  solution_proposee: 'Solution proposée',
  a_valider: 'À valider',
  reponse_envoyee: 'Réponse envoyée',
  cloture: 'Clôturé',
  reouvert: 'Réouvert',
};

export const DECISION_LABELS: Record<Decision, string> = {
  fondee: 'Fondée',
  partiellement_fondee: 'Partiellement fondée',
  non_fondee: 'Non fondée',
  irrecevable_motivee: 'Irrecevable motivée',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  basse: 'Basse',
  normale: 'Normale',
  haute: 'Haute',
  critique: 'Critique',
};

export const RISK_LABELS: Record<RiskLevel, string> = { faible: 'Faible', moyen: 'Moyen', eleve: 'Élevé' };

export const DEADLINE_FLAG_LABELS: Record<DeadlineFlag, string> = {
  ok: 'Dans les délais',
  a_risque: 'À risque',
  en_retard: 'En retard',
  clos_en_retard: 'Clos en retard',
  sans_regle: 'Règle à valider',
};

export const ROLE_LABELS: Record<Role, string> = {
  client: 'Client ou mandataire',
  agent_accueil: "Agent d'accueil",
  gestionnaire: 'Gestionnaire',
  responsable: 'Responsable de traitement',
  qualite: 'Qualité et service client',
  conformite: 'Conformité et contrôle interne',
  direction: 'Direction',
  admin: 'Administrateur',
};

export const SOLUTION_TYPE_LABELS: Record<SolutionType, string> = {
  remboursement: 'Remboursement',
  correction_operation: "Correction d'opération",
  explication_motivee: 'Explication motivée',
  autre_mesure: 'Autre mesure',
  non_fondement: 'Décision de non-fondement',
};

export const SOLUTION_STATUS_LABELS: Record<SolutionStatus, string> = {
  brouillon: 'Brouillon',
  soumise: 'Soumise · validation N1',
  approuvee_n1: 'Approuvée N1 · attente N2',
  approuvee: 'Approuvée',
  rejetee: 'Rejetée',
};

export const CONTROL_LABELS: Record<ControlResult, string> = {
  conforme: 'Conforme',
  non_conforme: 'Non conforme',
  a_revoir: 'À revoir',
};

export const QUALITY_STATUS_LABELS: Record<QualityActionStatus, string> = {
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  realisee: 'Réalisée',
  verifiee: 'Vérifiée',
};

export const ACK_LABELS: Record<AckStatus, string> = { en_attente: 'En attente', envoye: 'Envoyé', echec: "Échec d'envoi" };

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  client: 'Client',
  interne: 'Interne',
  confidentiel: 'Confidentiel',
};

export const VISIBILITY_LABELS: Record<Visibility, string> = { internal: 'Interne uniquement', client: 'Visible par le client' };

export const SCAN_LABELS: Record<ScanStatus, string> = { en_attente: 'Analyse en cours', sain: 'Analyse : sain', rejete: 'Rejeté (analyse)' };

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { a_faire: 'À faire', en_cours: 'En cours', terminee: 'Terminée' };

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  accuse: 'Accusé de réception',
  reponse_finale: 'Réponse finale',
  prealerte: 'Pré-alerte interne',
  controle: 'Contrôle',
};

export const RULE_UNIT_LABELS: Record<RuleUnit, string> = { calendar: 'Jours calendaires', business: 'Jours ouvrés' };

export const RULE_SOURCE_LABELS: Record<RuleSourceType, string> = {
  juridique: 'Juridique',
  interne: 'Interne',
  demonstration: 'Démonstration',
};

export const RULE_STATUS_LABELS: Record<RuleStatus, string> = {
  brouillon: 'Brouillon',
  a_valider: 'À valider',
  valide: 'Validée',
  retire: 'Retirée',
};

export const DEADLINE_STATUS_LABELS: Record<DeadlineStatus, string> = {
  en_cours: 'En cours',
  respectee: 'Respectée',
  depassee: 'Dépassée',
  respectee_en_retard: 'Respectée en retard',
};

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  accuse: 'Accusé de réception',
  attente: "Réponse d'attente",
  reponse: 'Réponse',
  cloture: 'Clôture',
};

export const REPLY_CHANNELS: ReplyChannel[] = ['courriel', 'courrier', 'telephone'];

export const REPLY_CHANNEL_LABELS: Record<ReplyChannel, string> = {
  courriel: 'Courriel (e-mail)',
  email: 'Courriel (e-mail)',
  courrier: 'Courrier',
  telephone: 'Téléphone',
};

export const CHANNEL_LABELS: Record<string, string> = {
  portail: 'Portail client',
  agence: 'Agence',
  telephone: 'Téléphone',
  courriel: 'Courriel',
  courrier: 'Courrier',
};

export const CURRENCIES = ['XAF', 'EUR', 'USD', 'CNY', 'XOF'] as const;

export function labelOf<K extends string>(map: Record<K, string>, key: K | null | undefined, fallback = '—'): string {
  if (!key) return fallback;
  return map[key] ?? key;
}

export function toOptions<K extends string>(map: Record<K, string>): { value: K; label: string }[] {
  return (Object.keys(map) as K[]).map((value) => ({ value, label: map[value] }));
}

/** Statut vu par le client (ARCHITECTURE §6) — jamais le statut interne brut. */
export const CLIENT_STATUS_OF: Record<ComplaintStatus, string> = {
  brouillon: 'Reçue',
  recu: 'Reçue',
  a_qualifier: 'Reçue',
  affecte: "En cours d'analyse",
  en_investigation: "En cours d'analyse",
  solution_proposee: "En cours d'analyse",
  a_valider: "En cours d'analyse",
  attente_information: 'Information demandée',
  reponse_envoyee: 'Réponse envoyée',
  cloture: 'Clôturée',
  reouvert: 'Réouverte',
};
