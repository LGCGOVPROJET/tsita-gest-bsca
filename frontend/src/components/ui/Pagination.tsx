import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@/types/api';
import { formatNumber } from '@/lib/format';
import { Button } from './Button';

interface PaginationProps {
  meta: PageMeta | undefined;
  onPage: (page: number) => void;
  onPerPage?: (perPage: number) => void;
  label?: string;
}

export function Pagination({ meta, onPage, onPerPage, label = 'Pagination' }: PaginationProps) {
  if (!meta) return null;
  const { current_page, last_page, per_page, total } = meta;
  const from = total === 0 ? 0 : (current_page - 1) * per_page + 1;
  const to = Math.min(current_page * per_page, total);
  return (
    <nav className="pagination" aria-label={label}>
      <span>
        {formatNumber(from)}–{formatNumber(to)} sur {formatNumber(total)}
      </span>
      <div className="row">
        {onPerPage && (
          <label className="field">
            <span>Par page</span>
            <select value={per_page} onChange={(e) => onPerPage(Number(e.target.value))}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button variant="alt" size="sm" onClick={() => onPage(current_page - 1)} disabled={current_page <= 1} aria-label="Page précédente" icon={<ChevronLeft size={16} aria-hidden="true" />}>
          Précédente
        </Button>
        <span aria-current="page">
          Page {current_page} sur {Math.max(last_page, 1)}
        </span>
        <Button variant="alt" size="sm" onClick={() => onPage(current_page + 1)} disabled={current_page >= last_page} aria-label="Page suivante">
          Suivante <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
