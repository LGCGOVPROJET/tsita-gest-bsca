import type { ReactNode } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  FileQuestion,
  History,
  Inbox,
  Lock,
  MessageCircleQuestion,
  RotateCcw,
  Scale,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type {
  ComplaintStatus,
  ControlResult,
  Decision,
  DeadlineFlag,
  Priority,
  QualityActionStatus,
  RuleStatus,
  SolutionStatus,
} from '@/types/api';
import {
  CONTROL_LABELS,
  DEADLINE_FLAG_LABELS,
  DECISION_LABELS,
  PRIORITY_LABELS,
  QUALITY_STATUS_LABELS,
  RULE_STATUS_LABELS,
  SOLUTION_STATUS_LABELS,
  STATUS_LABELS,
} from '@/lib/labels';

export type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral' | 'outline' | 'internal';

interface BadgeProps {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  title?: string;
}

/** Badge : toujours texte + icône + couleur (jamais la couleur seule). */
export function Badge({ tone = 'info', icon: Icon, children, title }: BadgeProps) {
  return (
    // « info » est rendu avec la classe « blue » pour éviter la collision avec la boîte .info.
    <span className={`badge ${tone === 'info' ? 'blue' : tone}`} title={title}>
      {Icon && <Icon size={13} aria-hidden="true" strokeWidth={2.5} />}
      {children}
    </span>
  );
}

/**
 * Marqueur constant des éléments internes (notes, pièces, événements) :
 * fond ambre + cadenas + mot « Interne ». Jamais visible dans le portail client.
 */
export function InternalBadge({ children = 'Interne' }: { children?: ReactNode }) {
  return (
    <Badge tone="internal" icon={Lock} title="Élément interne : jamais visible par le client">
      {children}
    </Badge>
  );
}

const FLAG: Record<DeadlineFlag, { tone: Tone; icon: LucideIcon }> = {
  ok: { tone: 'success', icon: CheckCircle2 },
  a_risque: { tone: 'warn', icon: AlertTriangle },
  en_retard: { tone: 'danger', icon: AlertOctagon },
  clos_en_retard: { tone: 'danger', icon: History },
  sans_regle: { tone: 'neutral', icon: FileQuestion },
};

export function DeadlineBadge({ flag, label }: { flag: DeadlineFlag | null | undefined; label?: string | null }) {
  if (!flag) return <span className="muted">—</span>;
  const conf = FLAG[flag] ?? FLAG.sans_regle;
  return (
    <Badge tone={conf.tone} icon={conf.icon}>
      {label || DEADLINE_FLAG_LABELS[flag] || flag}
    </Badge>
  );
}

const STATUS: Record<ComplaintStatus, { tone: Tone; icon: LucideIcon }> = {
  brouillon: { tone: 'neutral', icon: CircleDashed },
  recu: { tone: 'info', icon: Inbox },
  a_qualifier: { tone: 'info', icon: Search },
  affecte: { tone: 'info', icon: UserCheck },
  en_investigation: { tone: 'info', icon: Search },
  attente_information: { tone: 'warn', icon: MessageCircleQuestion },
  solution_proposee: { tone: 'info', icon: Scale },
  a_valider: { tone: 'warn', icon: Clock },
  reponse_envoyee: { tone: 'success', icon: Send },
  cloture: { tone: 'success', icon: Lock },
  reouvert: { tone: 'danger', icon: RotateCcw },
};

export function StatusBadge({ status, label }: { status: ComplaintStatus; label?: string | null }) {
  const conf = STATUS[status] ?? { tone: 'neutral' as Tone, icon: CircleDot };
  return (
    <Badge tone={conf.tone} icon={conf.icon}>
      {label || STATUS_LABELS[status] || status}
    </Badge>
  );
}

const DECISION: Record<Decision, Tone> = {
  fondee: 'success',
  partiellement_fondee: 'info',
  non_fondee: 'neutral',
  irrecevable_motivee: 'neutral',
};

const DECISION_ICON: Record<Decision, LucideIcon> = {
  fondee: CheckCircle2,
  partiellement_fondee: Scale,
  non_fondee: XCircle,
  irrecevable_motivee: Ban,
};

export function DecisionBadge({ decision, label }: { decision: Decision | null | undefined; label?: string | null }) {
  // Badge distinct du statut : toujours préfixé « Décision » pour ne jamais être confondu avec l'état du traitement.
  if (!decision)
    return (
      <Badge tone="outline" icon={CircleDashed} title="Décision de fond">
        Décision à déterminer
      </Badge>
    );
  return (
    <Badge tone={DECISION[decision] ?? 'neutral'} icon={DECISION_ICON[decision] ?? Scale} title="Décision de fond (distincte de l'état du traitement)">
      <span className="sr-only">Décision : </span>
      {label || DECISION_LABELS[decision] || decision}
    </Badge>
  );
}

const PRIO: Record<Priority, Tone> = { basse: 'neutral', normale: 'info', haute: 'warn', critique: 'danger' };

export function PriorityBadge({ priority }: { priority: Priority | null | undefined }) {
  if (!priority) return <span className="muted">—</span>;
  return (
    <Badge tone={PRIO[priority]} icon={priority === 'critique' || priority === 'haute' ? AlertTriangle : CircleDot}>
      {PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}

const SOL: Record<SolutionStatus, { tone: Tone; icon: LucideIcon }> = {
  brouillon: { tone: 'neutral', icon: CircleDashed },
  soumise: { tone: 'warn', icon: Clock },
  approuvee_n1: { tone: 'info', icon: ShieldCheck },
  approuvee: { tone: 'success', icon: CheckCircle2 },
  rejetee: { tone: 'danger', icon: XCircle },
};

export function SolutionStatusBadge({ status, label }: { status: SolutionStatus; label?: string | null }) {
  const conf = SOL[status] ?? SOL.brouillon;
  return (
    <Badge tone={conf.tone} icon={conf.icon}>
      {label || SOLUTION_STATUS_LABELS[status] || status}
    </Badge>
  );
}

const CTRL: Record<ControlResult, { tone: Tone; icon: LucideIcon }> = {
  conforme: { tone: 'success', icon: CheckCircle2 },
  non_conforme: { tone: 'danger', icon: XCircle },
  a_revoir: { tone: 'warn', icon: AlertTriangle },
};

export function ControlBadge({ result }: { result: ControlResult }) {
  const conf = CTRL[result] ?? CTRL.a_revoir;
  return (
    <Badge tone={conf.tone} icon={conf.icon}>
      {CONTROL_LABELS[result] ?? result}
    </Badge>
  );
}

const QA: Record<QualityActionStatus, { tone: Tone; icon: LucideIcon }> = {
  planifiee: { tone: 'info', icon: CircleDashed },
  en_cours: { tone: 'warn', icon: Clock },
  realisee: { tone: 'success', icon: CheckCircle2 },
  verifiee: { tone: 'success', icon: ShieldCheck },
};

export function QualityStatusBadge({ status }: { status: QualityActionStatus }) {
  const conf = QA[status] ?? QA.planifiee;
  return (
    <Badge tone={conf.tone} icon={conf.icon}>
      {QUALITY_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const RULE: Record<RuleStatus, { tone: Tone; icon: LucideIcon }> = {
  brouillon: { tone: 'neutral', icon: CircleDashed },
  a_valider: { tone: 'warn', icon: Clock },
  valide: { tone: 'success', icon: ShieldCheck },
  retire: { tone: 'neutral', icon: XCircle },
};

export function RuleStatusBadge({ status }: { status: RuleStatus }) {
  const conf = RULE[status] ?? RULE.brouillon;
  return (
    <Badge tone={conf.tone} icon={conf.icon}>
      {RULE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
