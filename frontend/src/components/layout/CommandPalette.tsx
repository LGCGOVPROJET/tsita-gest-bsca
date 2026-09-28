import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, FileText, Loader2, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { complaintsApi } from '@/api/endpoints';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/auth-context';
import { can, canAny } from '@/lib/permissions';
import { NAV } from './navItems';
import { StatusBadge } from '@/components/ui/Badge';

interface PaletteOption {
  id: string;
  group: 'Dossiers' | 'Pages';
  label: string;
  sub?: string;
  to: string;
  complaint?: { status: import('@/types/api').ComplaintStatus; status_label: string };
}

/** Recherche rapide (Ctrl/⌘+K) : références, objets, clients et pages. Motif combobox + listbox. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounce(q.trim(), 250);
  const navigate = useNavigate();
  const { user } = useAuth();
  const listId = useId();
  const canSearch = can(user, 'complaints.view');

  const search = useQuery({
    queryKey: ['palette', debounced],
    queryFn: () => complaintsApi.list({ search: debounced, per_page: '8' }),
    enabled: open && canSearch && debounced.length >= 2,
    staleTime: 30_000,
  });

  const options = useMemo<PaletteOption[]>(() => {
    const pages: PaletteOption[] = NAV.flatMap((s) => s.items)
      .filter((it) => !it.anyOf || canAny(user, ...it.anyOf))
      .filter((it) => !q || it.label.toLowerCase().includes(q.toLowerCase()))
      .map((it) => ({ id: `p-${it.to}`, group: 'Pages', label: it.label, to: it.to }));
    const dossiers: PaletteOption[] = (search.data?.data ?? []).map((c) => ({
      id: `c-${c.id}`,
      group: 'Dossiers',
      label: c.reference,
      sub: `${c.subject} · ${c.customer_name}`,
      to: `/app/reclamations/${c.id}`,
      complaint: { status: c.status, status_label: c.status_label },
    }));
    return [...dossiers, ...pages];
  }, [search.data, q, user]);

  const go = (opt: PaletteOption | undefined) => {
    if (!opt) return;
    onClose();
    setQ('');
    navigate(opt.to);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(options[active]);
    }
  };

  const activeId = options[active] ? `${listId}-${options[active].id}` : undefined;
  let lastGroup = '';

  return (
    <Modal open={open} onClose={onClose} title={<span className="sr-only">Recherche rapide</span>} className="palette" initialFocusSelector="input">
      <div className="palette-input" style={{ margin: '-4px -24px 0' }}>
        <Search size={20} aria-hidden="true" color="var(--muted)" />
        <input
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label="Rechercher une référence, un objet, un client ou une page"
          placeholder={canSearch ? 'Référence (TG-BSCA-…), objet, client ou page' : 'Rechercher une page'}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          autoComplete="off"
        />
        {search.isFetching && <Loader2 size={18} className="spin" aria-hidden="true" style={{ animation: 'spin .9s linear infinite' }} />}
      </div>
      <ul id={listId} role="listbox" aria-label="Résultats" className="palette-list" style={{ margin: '0 -24px' }}>
        {options.map((o, i) => {
          const header = o.group !== lastGroup ? o.group : null;
          lastGroup = o.group;
          return (
            <li key={o.id} role="presentation">
              {header && (
                <div className="palette-group" role="presentation">
                  {header}
                </div>
              )}
              <div
                id={`${listId}-${o.id}`}
                role="option"
                aria-selected={i === active}
                className="palette-option"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(o)}
              >
                <FileText size={17} aria-hidden="true" color="var(--blue)" />
                <span className="po-main">
                  <span style={{ fontWeight: 800 }}>{o.label}</span>
                  {o.sub && <span className="caption">{o.sub}</span>}
                </span>
                {o.complaint && <StatusBadge status={o.complaint.status} label={o.complaint.status_label} />}
              </div>
            </li>
          );
        })}
        {options.length === 0 && (
          <li className="empty" role="presentation" style={{ padding: 20 }}>
            {debounced.length >= 2 && !search.isFetching ? 'Aucun résultat.' : 'Saisissez au moins 2 caractères.'}
          </li>
        )}
      </ul>
      <div className="palette-foot" style={{ margin: '0 -24px -8px' }} aria-hidden="true">
        <span>↑ ↓ pour naviguer</span>
        <span>
          <CornerDownLeft size={12} /> pour ouvrir
        </span>
        <span>Échap pour fermer</span>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {debounced.length >= 2 && !search.isFetching ? `${options.length} résultat(s)` : ''}
      </div>
    </Modal>
  );
}
