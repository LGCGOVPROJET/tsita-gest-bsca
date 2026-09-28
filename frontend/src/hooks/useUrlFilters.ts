import { useSearchParams } from 'react-router';

/**
 * Filtres persistés dans l'URL (partageables, conservés au rechargement).
 * Les valeurs par défaut ne sont pas écrites dans l'URL.
 */
export function useUrlFilters<K extends string>(keys: readonly K[], defaults: Partial<Record<K, string>> = {}) {
  const [params, setParams] = useSearchParams();

  const values = {} as Record<K, string>;
  for (const k of keys) values[k] = params.get(k) ?? defaults[k] ?? '';

  const setMany = (patch: Partial<Record<K, string>>, opts: { resetPage?: boolean } = { resetPage: true }) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch) as [K, string | undefined][]) {
          if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
          else next.set(k, v);
        }
        if (opts.resetPage && !('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  const set = (key: K, value: string) => setMany({ [key]: value } as Partial<Record<K, string>>);

  const reset = () => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of keys) next.delete(k);
        return next;
      },
      { replace: true },
    );
  };

  const activeCount = keys.filter((k) => params.get(k) !== null && k !== 'page' && k !== 'sort' && k !== 'per_page' && k !== 'queue' && k !== 'statut').length;

  return { values, set, setMany, reset, activeCount };
}
