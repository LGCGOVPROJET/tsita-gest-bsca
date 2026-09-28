import type { ReactNode } from 'react';

export interface TimelineItem {
  key: string | number;
  title: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
  variant?: 'default' | 'internal' | 'pending' | 'red';
}

export function Timeline({ items, label }: { items: TimelineItem[]; label?: string }) {
  return (
    <ol className="timeline" aria-label={label}>
      {items.map((it) => (
        <li key={it.key} className={`event ${it.variant && it.variant !== 'default' ? it.variant : ''}`}>
          <b>{it.title}</b>
          {it.meta && <small>{it.meta}</small>}
          {it.body && <p>{it.body}</p>}
        </li>
      ))}
    </ol>
  );
}
