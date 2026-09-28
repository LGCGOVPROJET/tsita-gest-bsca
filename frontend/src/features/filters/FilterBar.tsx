import type { ReactNode } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { useReferentials } from '@/hooks/useReferentials';
import { DEADLINE_FLAG_LABELS, STATUS_LABELS, toOptions } from '@/lib/labels';
import { Button } from '@/components/ui/Button';

export type FilterKey =
  | 'search'
  | 'from'
  | 'to'
  | 'as_of'
  | 'agency_id'
  | 'entity_id'
  | 'category_id'
  | 'product_id'
  | 'channel'
  | 'status'
  | 'deadline_flag'
  | 'mine';

interface FilterBarProps {
  fields: FilterKey[];
  values: Partial<Record<FilterKey, string>>;
  onChange: (key: FilterKey, value: string) => void;
  onReset?: () => void;
  note?: ReactNode;
  label?: string;
  children?: ReactNode;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
}

/** Carte de filtres commune (tableau de bord, liste, délais, rapports) — mêmes clés que l'API (§8). */
export function FilterBar({ fields, values, onChange, onReset, note, label = 'Filtres', children, searchValue, onSearchChange }: FilterBarProps) {
  const ref = useReferentials();
  const r = ref.data;
  const has = (k: FilterKey) => fields.includes(k);
  const val = (k: FilterKey) => values[k] ?? '';

  const select = (k: FilterKey, lbl: string, all: string, options: { value: string | number; label: string }[]) => (
    <label className="field" key={k}>
      <span className="label-text">{lbl}</span>
      <select value={val(k)} onChange={(e) => onChange(k, e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form className="filters" role="search" aria-label={label} onSubmit={(e) => e.preventDefault()}>
      {has('search') && (
        <label className="field search">
          <span className="label-text">Rechercher</span>
          <span style={{ position: 'relative', display: 'block' }}>
            <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 11, top: 12, color: 'var(--muted)' }} />
            <input
              type="search"
              placeholder="Référence, objet ou nom du client"
              value={searchValue ?? val('search')}
              onChange={(e) => (onSearchChange ? onSearchChange(e.target.value) : onChange('search', e.target.value))}
              style={{ paddingLeft: 34 }}
            />
          </span>
        </label>
      )}
      {has('from') && (
        <label className="field">
          <span className="label-text">Du</span>
          <input type="date" value={val('from')} max={val('to') || undefined} onChange={(e) => onChange('from', e.target.value)} />
        </label>
      )}
      {has('to') && (
        <label className="field">
          <span className="label-text">Au</span>
          <input type="date" value={val('to')} min={val('from') || undefined} onChange={(e) => onChange('to', e.target.value)} />
        </label>
      )}
      {has('as_of') && (
        <label className="field">
          <span className="label-text">Date de calcul</span>
          <input type="date" value={val('as_of')} onChange={(e) => onChange('as_of', e.target.value)} />
        </label>
      )}
      {has('status') && select('status', 'État', 'Tous les états', r?.statuses?.length ? r.statuses : toOptions(STATUS_LABELS))}
      {has('agency_id') && select('agency_id', 'Agence de réception', 'Toutes les agences', (r?.agencies ?? []).map((a) => ({ value: a.id, label: a.name })))}
      {has('entity_id') && select('entity_id', 'Fonction de traitement', 'Toutes les fonctions', (r?.entities ?? []).map((a) => ({ value: a.id, label: a.name })))}
      {has('category_id') && select('category_id', 'Catégorie', 'Toutes les catégories', (r?.categories ?? []).map((a) => ({ value: a.id, label: a.label })))}
      {has('product_id') && select('product_id', 'Produit', 'Tous les produits', (r?.products ?? []).map((a) => ({ value: a.id, label: a.label })))}
      {has('channel') && select('channel', 'Canal', 'Tous les canaux', (r?.channels ?? []).map((c) => ({ value: c.code, label: c.label })))}
      {has('deadline_flag') && select('deadline_flag', "Signal d'échéance", 'Tous les signaux', toOptions(DEADLINE_FLAG_LABELS))}
      {has('mine') && (
        <label className="check-inline">
          <input type="checkbox" checked={val('mine') === '1'} onChange={(e) => onChange('mine', e.target.checked ? '1' : '')} />
          Mes dossiers
        </label>
      )}
      {children}
      {onReset && (
        <Button variant="alt" onClick={onReset} icon={<RotateCcw size={15} aria-hidden="true" />}>
          Effacer les filtres
        </Button>
      )}
      {note && (
        <span className="filter-note" role="status" aria-live="polite">
          {note}
        </span>
      )}
    </form>
  );
}
