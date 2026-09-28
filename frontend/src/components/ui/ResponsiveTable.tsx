import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Clé de tri envoyée à l'API (ex. `received_at`). */
  sortKey?: string;
  className?: string;
  /** Masquer dans la carte mobile. */
  hideOnMobile?: boolean;
  /** Sert de titre à la carte mobile (et n'est pas répété dans ses lignes). */
  mobileTitle?: boolean;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  caption: string;
  /** Titre de la carte mobile. */
  mobileTitle?: (row: T) => ReactNode;
  mobileBadge?: (row: T) => ReactNode;
  sort?: string;
  onSort?: (sort: string) => void;
  captionVisible?: boolean;
}

/** Tableau sur écran large, liste de cartes sur mobile (< 700 px). Tri annoncé via aria-sort. */
export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  mobileTitle,
  mobileBadge,
  sort,
  onSort,
  captionVisible,
}: ResponsiveTableProps<T>) {
  const titleColumn = columns.find((c) => c.mobileTitle);
  const sortField = sort?.replace(/^-/, '');
  const desc = sort?.startsWith('-');

  const header = (c: Column<T>) => {
    if (!c.sortKey || !onSort) return c.header;
    const active = sortField === c.sortKey;
    const Icon = active ? (desc ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <button
        type="button"
        className="sort-btn"
        onClick={() => onSort(active && !desc ? `-${c.sortKey}` : (c.sortKey as string))}
        title={`Trier par ${c.header.toLowerCase()}`}
      >
        {c.header}
        <Icon size={13} aria-hidden="true" />
      </button>
    );
  };

  const ariaSort = (c: Column<T>): 'ascending' | 'descending' | 'none' | undefined => {
    if (!c.sortKey || !onSort) return undefined;
    if (sortField !== c.sortKey) return 'none';
    return desc ? 'descending' : 'ascending';
  };

  return (
    <div className="responsive-table">
      <div className="tablewrap">
        <table className="table">
          <caption className={captionVisible ? 'caption' : 'sr-only'}>
            {caption}
            {sortField && onSort && (
              <span className="sr-only">
                {' '}
                — trié par {columns.find((c) => c.sortKey === sortField)?.header ?? sortField}, ordre {desc ? 'décroissant' : 'croissant'}
              </span>
            )}
          </caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" aria-sort={ariaSort(c)} className={c.className}>
                  {header(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mobile-cards" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="mobile-card">
            {(titleColumn || mobileTitle || mobileBadge) && (
              <div className="mc-title">
                <span>{titleColumn ? titleColumn.render(r) : mobileTitle?.(r)}</span>
                {mobileBadge?.(r)}
              </div>
            )}
            <dl>
              {columns
                .filter((c) => !c.hideOnMobile && c !== titleColumn)
                .map((c) => (
                  <div key={c.key} style={{ display: 'contents' }}>
                    <dt>{c.header}</dt>
                    <dd>{c.render(r)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
