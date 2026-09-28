import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';

interface FieldShellProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  id?: string;
}

export function FieldShell({ label, hint, error, required, className, children, id: forcedId }: FieldShellProps) {
  const auto = useId();
  const id = forcedId ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id} className="label-text">
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            {' '}*
          </span>
        )}
        {required && <span className="sr-only"> (obligatoire)</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errId} className="error">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
}

type Common = { label: ReactNode; hint?: ReactNode; error?: string; className?: string };

export const Input = forwardRef<HTMLInputElement, Common & InputHTMLAttributes<HTMLInputElement>>(function Input(
  { label, hint, error, className, required, id, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={className} id={id}>
      {({ id: fid, describedBy, invalid }) => (
        <input ref={ref} id={fid} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required={required || undefined} {...rest} />
      )}
    </FieldShell>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, Common & TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { label, hint, error, className, required, id, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={className} id={id}>
      {({ id: fid, describedBy, invalid }) => (
        <textarea ref={ref} id={fid} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required={required || undefined} {...rest} />
      )}
    </FieldShell>
  );
});

export interface SelectOption {
  value: string | number;
  label: string;
}

export const Select = forwardRef<
  HTMLSelectElement,
  Common & SelectHTMLAttributes<HTMLSelectElement> & { options: SelectOption[]; placeholder?: string }
>(function Select({ label, hint, error, className, required, id, options, placeholder, ...rest }, ref) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={className} id={id}>
      {({ id: fid, describedBy, invalid }) => (
        <select ref={ref} id={fid} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required={required || undefined} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
});
