import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'alt' | 'text' | 'blue' | 'success' | 'danger-outline';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  loading?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, iconOnly, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    variant !== 'primary' ? variant : '',
    size === 'sm' ? 'sm' : '',
    iconOnly ? 'icon-only' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});
