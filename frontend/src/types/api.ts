/**
 * Types reflétant le contrat docs/ARCHITECTURE.md (§4, §6, §8, §9).
 * Les champs non détaillés par le contrat sont typés de façon tolérante (optionnels).
 */

// ——— Énumérations (§4, §6) ———
export type Role =
  | 'client'
  | 'agent_accueil'
  | 'gestionnaire'
  | 'responsable'
  | 'qualite'
  | 'conformite'
  | 'direction'
  | 'admin';

export type Permission =
  | 'complaints.view'
  | 'complaints.create'
  | 'complaints.qualify'
  | 'complaints.assign'
  | 'complaints.transition'
  | 'complaints.respond'
  | 'complaints.reopen'
  | 'complaints.export'
  | 'solutions.propose'
  | 'solutions.approve_n1'
  | 'solutions.approve_n2'
  | 'quality.manage'
  | 'quality.control'
  | 'reports.view'
  | 'reports.validate'
  | 'dashboard.view'
  | 'deadlines.view'
  | 'admin.users'
  | 'admin.referentials'
  | 'admin.rules'
  | 'admin.rules.validate'
  | 'admin.audit'
  | 'admin.imports';

export type ComplaintStatus =
  | 'brouillon'
  | 'recu'
  | 'a_qualifier'
  | 'affecte'
  | 'en_investigation'
  | 'attente_information'
  | 'solution_proposee'
  | 'a_valider'
  | 'reponse_envoyee'
  | 'cloture'
  | 'reouvert';

export type Decision = 'fondee' | 'partiellement_fondee' | 'non_fondee' | 'irrecevable_motivee';
export type Priority = 'basse' | 'normale' | 'haute' | 'critique';
export type RiskLevel = 'faible' | 'moyen' | 'eleve';
export type DeadlineFlag = 'ok' | 'a_risque' | 'en_retard' | 'clos_en_retard' | 'sans_regle';
export type ChannelCode = 'portail' | 'agence' | 'telephone' | 'courriel' | 'courrier';
/** Codes réels ; `email` reste accepté comme alias de `courriel` par l'API. */
export type ReplyChannel = 'courriel' | 'courrier' | 'telephone' | 'email';
export type AckStatus = 'en_attente' | 'envoye' | 'echec';
export type DeliveryStatus = 'en_attente' | 'envoye' | 'echec';
export type SolutionType =
  | 'remboursement'
  | 'correction_operation'
  | 'explication_motivee'
  | 'autre_mesure'
  | 'non_fondement';
export type SolutionStatus = 'brouillon' | 'soumise' | 'approuvee_n1' | 'approuvee' | 'rejetee';
export type ApprovalDecision = 'approuve' | 'rejete';
export type ControlResult = 'conforme' | 'non_conforme' | 'a_revoir';
export type QualityActionStatus = 'planifiee' | 'en_cours' | 'realisee' | 'verifiee';
export type Classification = 'client' | 'interne' | 'confidentiel';
export type Visibility = 'internal' | 'client';
export type ScanStatus = 'en_attente' | 'sain' | 'rejete';
export type MessageKind = 'client_message' | 'internal_note';
export type TaskStatus = 'a_faire' | 'en_cours' | 'terminee';
export type RuleKind = 'accuse' | 'reponse_finale' | 'prealerte' | 'controle';
export type RuleUnit = 'calendar' | 'business';
export type RuleSourceType = 'juridique' | 'interne' | 'demonstration';
export type RuleStatus = 'brouillon' | 'a_valider' | 'valide' | 'retire';
export type DeadlineStatus = 'en_cours' | 'respectee' | 'depassee' | 'respectee_en_retard';
export type TemplateKind = 'accuse' | 'attente' | 'reponse' | 'cloture';
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export type ClientStatus =
  | 'recue'
  | 'en_cours'
  | 'information_demandee'
  | 'reponse_envoyee'
  | 'cloturee'
  | 'reouverte'
  | string;

// ——— Enveloppes ———
export interface Resource<T> {
  data: T;
}

export interface PageMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface Option<V extends string = string> {
  value: V;
  label: string;
}

export interface Ref {
  id: number;
  name: string;
}

export interface LabelRef {
  id: number;
  label: string;
}

// ——— Auth (§4, §9.1) ———
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  role_label: string;
  agency: Ref | null;
  entity: Ref | null;
  mfa_enabled: boolean;
  /** Le profil exige la MFA (SEC-01). */
  mfa_required?: boolean;
  /** MFA exigée mais non configurée : seul l'écran d'enrôlement est accessible. */
  mfa_enrollment_required?: boolean;
  permissions: Permission[];
}

export interface LoginPayload {
  email: string;
  password: string;
  mfa_code?: string;
}

export type LoginResponse = { data: User } | { mfa_required: true };

// ——— Référentiels (§9.4) ———
export interface Agency {
  id: number;
  name: string;
  code?: string;
  city?: string;
  is_active?: boolean;
}

export interface Entity {
  id: number;
  name: string;
  code?: string;
  is_active?: boolean;
}

export interface Category {
  id: number;
  label: string;
  code?: string;
  description?: string | null;
  is_active?: boolean;
  version?: number;
}

export interface Product {
  id: number;
  label: string;
  code?: string;
  is_active?: boolean;
}

export interface Channel {
  code: ChannelCode | string;
  label: string;
  id?: number;
}

export interface RefUser {
  id: number;
  name: string;
  role: Role;
  entity_id: number | null;
}

export interface Referentials {
  agencies: Agency[];
  entities: Entity[];
  categories: Category[];
  products: Product[];
  channels: Channel[];
  statuses: Option<ComplaintStatus>[];
  decisions: Option<Decision>[];
  priorities: Option<Priority>[];
  solution_types: Option<SolutionType>[];
  users: RefUser[];
  /** Non prévu par le contrat : utilisé s'il est fourni (modèles de réponse pour les non-admins). */
  templates?: ResponseTemplate[];
  risk_levels?: Option<RiskLevel>[];
}

export interface PublicReferentials {
  categories: Category[];
  products: Product[];
  channels_reply: ReplyChannel[];
  agencies: Agency[];
}

// ——— Réclamations (§9.4) ———
export interface ComplaintListItem {
  id: number;
  reference: string;
  subject: string;
  customer_name: string;
  channel: { code: string; label: string };
  receiving_agency: Ref | null;
  processing_entity: Ref | null;
  category: LabelRef | null;
  status: ComplaintStatus;
  status_label: string;
  decision: Decision | null;
  decision_label: string | null;
  priority: Priority;
  received_at: string;
  due_at: string | null;
  deadline_flag: DeadlineFlag;
  deadline_flag_label: string;
  owner: Ref | null;
}

export interface Actor {
  id?: number;
  name: string;
}

export type ActorLike = Actor | string | null | undefined;

export interface TimelineEvent {
  id: number;
  type: string;
  title: string;
  description?: string | null;
  visibility: Visibility;
  from_status?: ComplaintStatus | null;
  to_status?: ComplaintStatus | null;
  actor?: ActorLike;
  reason?: string | null;
  type_label?: string;
  /** L'API renvoie `date` ; `created_at` accepté en repli. */
  date?: string;
  created_at?: string;
}

export interface ComplaintDeadline {
  id: number;
  kind: RuleKind;
  kind_label?: string;
  unit: RuleUnit;
  rule_version?: number | string;
  rule_label?: string;
  rule_is_demo?: boolean;
  rule?: { id: number; code: string; label: string; version: number | string; is_demo: boolean; source_type: RuleSourceType } | null;
  status_label?: string;
  due_at: string;
  initial_due_at: string;
  announced_at?: string | null;
  met_at?: string | null;
  status: DeadlineStatus;
}

export interface Attachment {
  id: number;
  /** L'API renvoie `name` ; `original_name` accepté en repli. */
  name?: string;
  original_name?: string;
  classification_label?: string;
  can_download?: boolean;
  download_url?: string;
  date?: string;
  mime: string;
  size: number;
  sha256?: string;
  classification: Classification;
  visibility: Visibility;
  scan_status: ScanStatus;
  uploaded_by?: ActorLike;
  uploaded_by_client?: boolean;
  created_at?: string;
}

export interface Message {
  id: number;
  kind: MessageKind;
  direction?: 'entrant' | 'sortant' | null;
  channel?: { code: string; label: string } | string | null;
  author?: ActorLike;
  author_is_client: boolean;
  subject?: string | null;
  body: string;
  delivery_status?: DeliveryStatus | null;
  sent_at?: string | null;
  date?: string;
  created_at?: string;
  kind_label?: string;
  delivery_status_label?: string;
}

export interface Task {
  id: number;
  title: string;
  description?: string | null;
  assignee?: Ref | null;
  assignee_id?: number | null;
  due_at?: string | null;
  status: TaskStatus;
  completed_at?: string | null;
}

export interface Approval {
  id?: number;
  level: 1 | 2;
  approver?: ActorLike;
  decision: ApprovalDecision;
  comment?: string | null;
  decided_at: string;
}

export interface Solution {
  id: number;
  version: number;
  type: SolutionType;
  type_label?: string;
  description: string;
  root_cause?: string | null;
  amount: string | null;
  currency: string | null;
  decision: Decision | null;
  decision_label?: string | null;
  status: SolutionStatus;
  status_label?: string;
  requires_n2: boolean;
  proposed_by?: ActorLike;
  submitted_at?: string | null;
  created_at?: string;
  approvals: Approval[];
}

export interface QualityControl {
  id: number;
  result: ControlResult;
  findings?: string | null;
  controller?: ActorLike;
  controlled_at: string;
}

export interface AuditEntry {
  id: number;
  user?: ActorLike;
  action: string;
  auditable_type?: string | null;
  auditable_id?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  ip?: string | null;
  date?: string;
  created_at?: string;
}

export interface ComplaintDetail extends ComplaintListItem {
  description: string;
  customer: { id: number; full_name: string; email: string | null; phone: string | null };
  product: LabelRef | null;
  amount: string | null;
  currency: string | null;
  amount_flagged: boolean;
  risk_level: RiskLevel | null;
  acknowledged_at: string | null;
  acknowledgment_status: AckStatus;
  final_response_at: string | null;
  closed_at: string | null;
  deputy: Ref | null;
  parent: { id: number; reference: string } | null;
  children: { id: number; reference: string; status: ComplaintStatus; status_label?: string }[];
  duplicate_of: { id: number; reference: string } | null;
  source: { system: string; id: string; status_label: string | null } | null;
  next_action: string | null;
  deadlines: ComplaintDeadline[];
  timeline: TimelineEvent[];
  attachments: Attachment[];
  messages: Message[];
  tasks: Task[];
  solutions: Solution[];
  controls: QualityControl[];
  audit: AuditEntry[];
  allowed_transitions: Option<ComplaintStatus>[];
  can: {
    qualify: boolean;
    assign: boolean;
    transition: boolean;
    respond: boolean;
    reopen: boolean;
    propose: boolean;
    approve: boolean;
    // Indicateurs supplémentaires fournis par l'API (non listés au contrat §9.4).
    acknowledge?: boolean;
    note?: boolean;
    attach?: boolean;
    mark_duplicate?: boolean;
    control?: boolean;
    manage_tasks?: boolean;
  };
  operation_date?: string | null;
}

export interface ComplaintFilters {
  from?: string;
  to?: string;
  as_of?: string;
  agency_id?: string;
  entity_id?: string;
  category_id?: string;
  product_id?: string;
  channel?: string;
  status?: string;
  search?: string;
  deadline_flag?: string;
  owner_id?: string;
  mine?: string;
  sort?: string;
  page?: string;
  per_page?: string;
}

// ——— Tableau de bord (§8, §9.4) ———
export interface TreatmentRate {
  numerator: number;
  denominator: number;
  value: number | null;
}

export interface DashboardKpis {
  received: number;
  responded: number;
  stock: number;
  at_risk: number;
  cohort_treated: number;
  late_open: number;
  late_closed: number;
  treatment_rate: TreatmentRate;
}

export interface Dashboard {
  kpis: DashboardKpis;
  monthly: { month: string; label: string; received: number; responded: number }[];
  by_category: { label: string; count: number }[];
  by_channel: { label: string; count: number }[];
  priorities: ComplaintListItem[];
  recent_events: { date: string; reference: string; title: string; actor: ActorLike; complaint_id?: number }[];
  meta: {
    from: string;
    to: string;
    as_of: string;
    filters: Record<string, unknown>;
    definitions: Partial<Record<keyof DashboardKpis | string, string>>;
    rule_is_demo: boolean;
    rule_version?: string | number | null;
  };
}

// ——— Délais ———
export interface DeadlineRule {
  id: number;
  code: string;
  label: string;
  kind: RuleKind;
  unit: RuleUnit;
  duration: number;
  start_point: string;
  source_type: RuleSourceType;
  source_reference: string | null;
  effective_from: string;
  effective_to: string | null;
  version: number | string;
  status: RuleStatus;
  is_demo?: boolean;
  kind_label?: string;
  unit_label?: string;
  source_type_label?: string;
  validated_by?: ActorLike;
  validated_at?: string | null;
  notes?: string | null;
}

export interface DeadlinesResponse extends Paginated<ComplaintListItem> {
  summary?: { a_risque: number; en_retard: number; clos_en_retard: number; a_echeance?: number };
  rules?: DeadlineRule[];
  rule_is_demo?: boolean;
}

// ——— Solutions (liste) ———
export interface SolutionListItem {
  id: number;
  version: number;
  complaint: { id: number; reference: string; subject: string };
  type: SolutionType;
  type_label: string;
  decision: Decision | null;
  decision_label?: string | null;
  status: SolutionStatus;
  status_label?: string;
  amount: string | null;
  currency: string | null;
  proposed_by: ActorLike;
  submitted_at: string | null;
  requires_n2: boolean;
  approvals: Approval[];
}

// ——— Qualité ———
export interface QualityAction {
  id: number;
  title: string;
  root_cause: string;
  category_id?: number | null;
  category?: LabelRef | null;
  owner_id?: number | null;
  owner?: Ref | null;
  owner_entity_id?: number | null;
  owner_entity?: Ref | null;
  due_at: string | null;
  status: QualityActionStatus;
  effectiveness_measure: string | null;
  evidence: string | null;
  completed_at?: string | null;
  complaints_count?: number;
}

export interface RecurringGroup {
  category: string | LabelRef | null;
  product: string | LabelRef | null;
  count: number;
  late_count: number;
  reopened_count: number;
}

// ——— Rapports ———
export type BreakdownRow = Record<string, string | number | null> & { label?: string };

export interface ActivityReport {
  opening_stock: number;
  inflow: number;
  outflow: number;
  adjustments: number | { label?: string; reason?: string; count: number }[];
  closing_stock: number;
  balanced: boolean;
  by_month: BreakdownRow[];
  by_agency: BreakdownRow[];
  by_entity: BreakdownRow[];
  by_channel: BreakdownRow[];
  by_category: BreakdownRow[];
  by_decision: BreakdownRow[];
  late_open: number;
  late_closed: number;
  validated_by?: { id: number; name: string } | null;
  validated_at?: string | null;
  validation?: { id: number; comment: string | null; rule_version?: string | number | null; as_of?: string | null; snapshot?: Record<string, unknown> | null } | null;
  meta: {
    from?: string;
    to?: string;
    as_of?: string;
    filters?: Record<string, unknown>;
    rule_version?: string | number | null;
    rule_is_demo?: boolean;
    generated_at?: string;
    generated_by?: string;
    definitions?: Record<string, string>;
    formula?: string;
    timezone?: string;
    computed_at?: string;
  };
}

// ——— Portail client (§9.2) ———
export interface PublicComplaintCreated {
  reference: string;
  tracking_code: string;
  received_at: string;
  acknowledgment_due_at: string | null;
  final_response_due_at: string | null;
  rule_is_demo: boolean;
}

export interface ClientComplaintView {
  reference: string;
  subject: string;
  category_label: string | null;
  product_label: string | null;
  client_status: ClientStatus;
  client_status_label: string;
  received_at: string;
  last_update_at: string;
  next_step: string | null;
  final_response: { sent_at: string; body: string | null } | null;
  timeline: { date: string; title: string; description?: string | null }[];
  messages: { date: string; from: 'client' | 'bsca'; body: string }[];
  documents: { name: string; date: string; from: 'client' | 'bsca' | string }[];
  can_reopen: boolean;
}

// ——— Administration ———
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  role_label?: string;
  agency_id: number | null;
  entity_id: number | null;
  agency?: Ref | null;
  entity?: Ref | null;
  phone: string | null;
  is_active: boolean;
  mfa_enabled?: boolean;
  last_login_at?: string | null;
  locked_until?: string | null;
}

export interface Holiday {
  id: number;
  date: string;
  label: string;
  calendar_version: string | number;
  country: string;
}

export interface ResponseTemplate {
  id: number;
  code: string;
  kind: TemplateKind;
  label: string;
  subject: string;
  body: string;
  version: number | string;
  is_active: boolean;
}

export interface ImportBatch {
  id: number;
  filename: string;
  file_sha256?: string;
  source_system: string;
  status: string;
  rows_total: number;
  rows_created: number;
  rows_skipped: number;
  rows_anomalies: number;
  report?: Record<string, unknown> | null;
  imported_by?: ActorLike;
  created_at: string;
  anomalies?: ImportAnomaly[];
}

export interface ImportAnomaly {
  id: number;
  row_number: number;
  source_id: string | null;
  issue: string;
  raw?: Record<string, unknown> | null;
  resolution_status: 'a_traiter' | 'resolu' | 'ignore';
}

// ——— Mon travail (files propres au profil) ———
export interface WorkloadItem {
  key: string;
  label: string;
  count: number;
  to: string;
  tone: 'blue' | 'warn' | 'danger' | 'green';
  hint: string;
}

export interface Workload {
  role: string;
  items: WorkloadItem[];
}

// ——— Vue d'ensemble de l'administration ———
export interface AdminOverview {
  users?: {
    total: number;
    active: number;
    inactive: number;
    locked: number;
    mfa_enabled: number;
    never_logged: number;
    clients: number;
    recent_logins: { id: number; name: string; role_label: string; date: string }[];
    by_role: { role: string; label: string; count: number }[];
  };
  health?: { key: string; label: string; ok: boolean; detail: string; to: string | null }[];
  rules?: {
    total: number;
    valide: number;
    a_valider: number;
    brouillon: number;
    retire: number;
    demonstration: number;
    pending: { id: number; label: string; duration: number; unit: string; version: number | string; is_demo: boolean }[];
  };
  referentials?: Record<'agencies' | 'entities' | 'categories' | 'products' | 'templates', { total: number; active: number }> & {
    holidays_next: { date: string; label: string }[];
  };
  imports?: {
    batches: number;
    anomalies_open: number;
    last: {
      id: number;
      filename: string;
      source_system: string;
      date: string;
      rows_total: number;
      rows_created: number;
      rows_skipped: number;
      rows_anomalies: number;
    } | null;
  };
  audit?: {
    today: number;
    last_7_days: number;
    daily: { date: string; label: string; count: number }[];
    top_actions: { label: string; count: number }[];
    recent: { id: number; date: string; action: string; user: string | null; target: string | null }[];
  };
  meta: { as_of: string; timezone: string };
}
