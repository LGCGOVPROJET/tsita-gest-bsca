import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  Archive,
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  FileWarning,
  FolderOpen,
  Gavel,
  Inbox,
  ListTodo,
  MailWarning,
  Route,
  ShieldAlert,
  Signpost,
  UserPlus,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { workloadApi } from '@/api/endpoints';
import { useAuth } from '@/lib/auth-context';
import { formatNumber } from '@/lib/format';
import { Skeleton } from '@/components/ui/Skeleton';

const ICONS: Record<string, LucideIcon> = {
  ack: MailWarning,
  qualify: Signpost,
  mine_month: Inbox,
  mine: FolderOpen,
  mine_late: AlarmClock,
  tasks: ListTodo,
  tasks_late: FileWarning,
  unrouted: Route,
  unassigned: UserPlus,
  n1: BadgeCheck,
  n2: Gavel,
  late: AlarmClock,
  to_control: ClipboardCheck,
  actions: Wrench,
  actions_late: FileWarning,
  rules: ShieldAlert,
  stock: Archive,
  at_risk: AlarmClock,
};

/** « Mon travail » : files de travail propres au profil connecté, chacune menant à la liste filtrée. */
export function WorkloadStrip() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['workload'], queryFn: workloadApi.get, staleTime: 30_000 });
  const items = q.data?.items ?? [];
  if (!q.isPending && items.length === 0) return null;

  return (
    <section className="workload" aria-labelledby="workload-title">
      <div className="workload-head">
        <h2 id="workload-title">Mon travail</h2>
        <span className="caption">{user?.role_label} · files mises à jour en temps réel dans votre périmètre</span>
      </div>
      <ul className="workload-grid">
        {q.isPending
          ? [0, 1, 2].map((i) => (
              <li key={i} className="work-card">
                <Skeleton height={64} />
              </li>
            ))
          : items.map((it, i) => {
              const Icon = ICONS[it.key] ?? Inbox;
              const tone = it.count === 0 ? 'calm' : it.tone;
              return (
                <li key={it.key} style={{ animationDelay: `${i * 60}ms` }} className={`work-card ${tone}`}>
                  <Link to={it.to} aria-label={`${it.label} : ${formatNumber(it.count)}. ${it.hint}`}>
                    <span className="work-icon" aria-hidden="true">
                      <Icon size={20} />
                    </span>
                    <span className="work-body">
                      <span className="work-count">{formatNumber(it.count)}</span>
                      <span className="work-label">{it.label}</span>
                      <span className="work-hint">{it.count === 0 ? 'Rien en attente' : it.hint}</span>
                    </span>
                    <ArrowRight size={16} className="work-arrow" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
