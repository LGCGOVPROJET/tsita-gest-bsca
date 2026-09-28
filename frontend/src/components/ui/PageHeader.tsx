import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, sub, actions }: PageHeaderProps) {
  return (
    <>
      <div className="eyebrow">{eyebrow}</div>
      <div className="heading">
        <div>
          <h1>{title}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {actions && <div className="heading-actions">{actions}</div>}
      </div>
    </>
  );
}

export function Hero({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <section className="hero" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </section>
  );
}
