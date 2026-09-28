import type { ReactNode } from 'react';
import { AlertCircle, Inbox, type LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <span className="empty-illu" aria-hidden="true">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty error" role="alert">
      <span className="empty-illu" aria-hidden="true">
        <AlertCircle size={28} />
      </span>
      <h3>Chargement impossible</h3>
      <p>{message}</p>
      {onRetry && (
        <Button variant="alt" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
