import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef<K extends string = string> {
  key: K;
  label: ReactNode;
  count?: number | null;
  icon?: ReactNode;
}

interface TabsProps<K extends string> {
  tabs: TabDef<K>[];
  active: K;
  onChange: (key: K) => void;
  label: string;
  idPrefix?: string;
}

/** Onglets WAI-ARIA (flèches gauche/droite, Début/Fin). Le panneau utilise tabPanelProps(). */
export function Tabs<K extends string>({ tabs, active, onChange, label, idPrefix }: TabsProps<K>) {
  const auto = useId();
  const prefix = idPrefix ?? auto;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.key === active);
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    const t = tabs[next];
    if (t) {
      onChange(t.key);
      refs.current[t.key]?.focus();
    }
  };

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.key}
          ref={(el) => {
            refs.current[t.key] = el;
          }}
          type="button"
          role="tab"
          id={`${prefix}-tab-${t.key}`}
          aria-controls={`${prefix}-panel-${t.key}`}
          aria-selected={t.key === active}
          tabIndex={t.key === active ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.key)}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && t.count !== null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
