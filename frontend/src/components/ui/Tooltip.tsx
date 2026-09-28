import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

interface InfoTipProps {
  /** Nom accessible du déclencheur, ex. « Définition : Reçues ». */
  label: string;
  children: ReactNode;
}

/**
 * Infobulle accessible (WCAG 1.4.13) : ouverte au survol, au focus et au clic,
 * persistante tant que le pointeur est dessus, fermée par Échap.
 */
export function InfoTip({ label, children }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  return (
    <span className="tip" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="tip-btn"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info size={15} aria-hidden="true" />
      </button>
      {/* Toujours présent dans le DOM : la définition reste annoncée (aria-describedby) même fermée. */}
      <span role="tooltip" id={id} className={open ? 'tip-pop' : 'sr-only'}>
        {children}
      </span>
    </span>
  );
}
