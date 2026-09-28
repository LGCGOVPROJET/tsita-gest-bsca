import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserCheck, X } from 'lucide-react';
import { customersApi, type CustomerMatch } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';

interface Props {
  selected: CustomerMatch | null;
  onSelect: (c: CustomerMatch | null) => void;
}

/** Recherche d'un client existant (GET /customers?search=, 20 résultats, numéro client masqué, accès journalisé). */
export function CustomerSearch({ selected, onSelect }: Props) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 350);
  const search = useQuery({
    queryKey: ['customers', dq],
    queryFn: () => customersApi.search(dq),
    enabled: dq.length >= 2 && !selected,
    staleTime: 30_000,
  });

  if (selected) {
    return (
      <InfoBox tone="success">
        <div className="row between" style={{ gap: 8 }}>
          <span>
            <UserCheck size={15} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Client rattaché : <strong>{selected.full_name}</strong>
            {selected.customer_number_masked ? ` · n° ${selected.customer_number_masked}` : ''} · {selected.complaints_count} réclamation(s)
          </span>
          <Button size="sm" variant="alt" icon={<X size={14} aria-hidden="true" />} onClick={() => onSelect(null)}>
            Détacher
          </Button>
        </div>
      </InfoBox>
    );
  }

  const results = search.data ?? [];
  return (
    <div className="customer-search">
      <div className="field" style={{ marginTop: 0 }}>
        <label className="label-text" htmlFor="customer-search">
          Rechercher un client existant
        </label>
        <span style={{ position: 'relative', display: 'block' }}>
          <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 11, top: 12, color: 'var(--muted)' }} />
          <input
            id="customer-search"
            type="search"
            autoComplete="off"
            placeholder="Nom, e-mail ou téléphone (2 caractères min.)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 34 }}
            aria-describedby="customer-search-hint"
          />
        </span>
        <span id="customer-search-hint" className="hint">
          Facultatif : rattacher la réclamation à un client connu. Sinon, saisissez ses coordonnées ci-dessous.
        </span>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {dq.length >= 2 && !search.isFetching ? `${results.length} client(s) trouvé(s)` : ''}
      </div>
      {search.isError && <InfoBox tone="danger">{toApiError(search.error).message}</InfoBox>}
      {dq.length >= 2 && !search.isFetching && results.length === 0 && !search.isError && <p className="caption">Aucun client trouvé.</p>}
      {results.length > 0 && (
        <ul className="customer-results" aria-label="Clients trouvés">
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" className="customer-result" onClick={() => onSelect(c)}>
                <strong>{c.full_name}</strong>
                <span className="caption">
                  {[c.email, c.phone, c.customer_number_masked ? `n° ${c.customer_number_masked}` : null].filter(Boolean).join(' · ') || 'Coordonnées non renseignées'}
                </span>
                <span className="caption">{c.complaints_count} réclamation(s)</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
