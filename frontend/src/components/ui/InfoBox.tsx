import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

type Tone = 'info' | 'warn' | 'danger' | 'success';
const ICONS = { info: Info, warn: AlertTriangle, danger: XCircle, success: CheckCircle2 };

export function InfoBox({ tone = 'info', children, role, className }: { tone?: Tone; children: ReactNode; role?: 'alert' | 'status' | 'note'; className?: string }) {
  const Icon = ICONS[tone];
  return (
    <div className={`info ${tone === 'info' ? '' : tone} ${className ?? ''}`} role={role}>
      <Icon size={17} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
