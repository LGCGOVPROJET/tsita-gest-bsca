import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'div' | 'section' | 'article';
  title?: ReactNode;
  caption?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  flat?: boolean;
}

export function Card({ as = 'section', title, caption, actions, headingLevel = 2, flat, className, children, ...rest }: CardProps) {
  const Tag = as;
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <Tag className={['card', flat ? 'flat' : '', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <H>{title}</H>}
            {caption && <span className="caption">{caption}</span>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
