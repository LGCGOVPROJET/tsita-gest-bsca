import { useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { InfoBox } from '@/components/ui/InfoBox';
import { ResponsiveTable, type Column } from '@/components/ui/ResponsiveTable';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';

export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'password';
  required?: boolean;
  /** Obligatoire uniquement à la création (ex. mot de passe). */
  requiredOnCreate?: boolean;
  options?: { value: string | number; label: string }[];
  hint?: string;
  full?: boolean;
  placeholder?: string;
  /** Champ absent du formulaire d'édition. */
  createOnly?: boolean;
  defaultValue?: string | boolean;
}

interface CrudSectionProps<T extends { id: number }> {
  resource: string;
  title: string;
  description?: ReactNode;
  columns: Column<T>[];
  fields: FieldDef[];
  itemLabel: (row: T) => string;
  canDelete?: boolean;
  extraActions?: (row: T) => ReactNode;
  toPayload?: (values: Record<string, string | boolean>, editing: T | null) => Record<string, unknown>;
  searchable?: boolean;
  newLabel?: string;
  notice?: ReactNode;
  readOnly?: boolean;
}

function initialValues<T>(fields: FieldDef[], row: T | null): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const f of fields) {
    const rec = row as Record<string, unknown> | null;
    let raw = rec ? rec[f.name] : undefined;
    // Repli : `agency_id` absent mais `agency: {id}` présent (formes de l'API).
    if (rec && raw === undefined && f.name.endsWith('_id')) {
      const nested = rec[f.name.slice(0, -3)] as { id?: unknown } | null | undefined;
      raw = nested && typeof nested === 'object' ? nested.id : undefined;
    }
    if (f.type === 'checkbox') out[f.name] = row ? Boolean(raw) : (f.defaultValue as boolean | undefined) ?? true;
    else if (f.type === 'password') out[f.name] = '';
    else if (f.type === 'date') out[f.name] = typeof raw === 'string' ? raw.slice(0, 10) : '';
    else out[f.name] = raw === null || raw === undefined ? ((f.defaultValue as string | undefined) ?? '') : String(raw);
  }
  return out;
}

/** Section d'administration générique : liste paginée, création, modification, suppression (si autorisée). */
export function CrudSection<T extends { id: number }>({
  resource,
  title,
  description,
  columns,
  fields,
  itemLabel,
  canDelete = false,
  extraActions,
  toPayload,
  searchable = true,
  newLabel = 'Ajouter',
  notice,
  readOnly = false,
}: CrudSectionProps<T>) {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const ds = useDebounce(search.trim(), 300);
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);

  const q = useQuery({
    queryKey: ['admin', resource, page, ds],
    queryFn: () => adminApi.list<T>(resource, { page: String(page), search: ds || undefined }),
    placeholderData: keepPreviousData,
  });

  const del = useMutation({
    mutationFn: (row: T) => adminApi.remove(resource, row.id),
    onSuccess: async () => {
      toast.success('Élément supprimé.');
      setDeleting(null);
      await qc.invalidateQueries({ queryKey: ['admin', resource] });
      await qc.invalidateQueries({ queryKey: ['referentials'] });
    },
  });

  const allColumns: Column<T>[] = [
    ...columns,
    {
      key: '__actions',
      header: 'Actions',
      render: (row) => (
        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          {extraActions?.(row)}
          {!readOnly && (
          <Button size="sm" variant="alt" icon={<Pencil size={14} aria-hidden="true" />} onClick={() => setEditing(row)} aria-label={`Modifier ${itemLabel(row)}`}>
            Modifier
          </Button>
          )}
          {canDelete && !readOnly && (
            <Button size="sm" variant="danger-outline" iconOnly onClick={() => setDeleting(row)} aria-label={`Supprimer ${itemLabel(row)}`}>
              <Trash2 size={14} aria-hidden="true" />
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <section aria-label={title}>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {description && <span className="caption">{description}</span>}
        </div>
        {!readOnly && (
          <Button icon={<Plus size={15} aria-hidden="true" />} onClick={() => setEditing('new')}>
            {newLabel}
          </Button>
        )}
      </div>
      {notice}
      {searchable && (
        <div className="field" style={{ maxWidth: 360 }}>
          <label className="label-text" htmlFor={`${resource}-search`}>
            Rechercher
          </label>
          <span style={{ position: 'relative' }}>
            <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 11, top: 12, color: 'var(--muted)' }} />
            <input id={`${resource}-search`} type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ paddingLeft: 34 }} />
          </span>
        </div>
      )}
      {q.isPending ? (
        <SkeletonRows rows={5} cols={4} />
      ) : q.isError ? (
        <ErrorState message={toApiError(q.error).message} onRetry={() => q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <EmptyState title="Aucun élément" description={ds ? 'Aucun résultat pour cette recherche.' : 'Ajoutez un premier élément.'} />
      ) : (
        <>
          <ResponsiveTable caption={title} columns={allColumns} rows={q.data.data} rowKey={(r) => r.id} mobileTitle={itemLabel} />
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      )}

      {editing && (
        <CrudForm<T>
          resource={resource}
          title={editing === 'new' ? `${newLabel}` : `Modifier · ${itemLabel(editing)}`}
          fields={fields}
          row={editing === 'new' ? null : editing}
          toPayload={toPayload}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title="Confirmer la suppression"
          description={`« ${itemLabel(deleting)} » sera supprimé. Si l'élément est utilisé par des dossiers, la suppression sera refusée : désactivez-le plutôt.`}
          footer={
            <>
              <Button variant="alt" onClick={() => setDeleting(null)}>
                Annuler
              </Button>
              <Button variant="danger-outline" loading={del.isPending} onClick={() => del.mutate(deleting)}>
                Supprimer
              </Button>
            </>
          }
        >
          {del.isError && <InfoBox tone="danger" role="alert">{toApiError(del.error).message}</InfoBox>}
        </Modal>
      )}
    </section>
  );
}

function CrudForm<T extends { id: number }>({
  resource,
  title,
  fields,
  row,
  toPayload,
  onClose,
}: {
  resource: string;
  title: string;
  fields: FieldDef[];
  row: T | null;
  toPayload?: (values: Record<string, string | boolean>, editing: T | null) => Record<string, unknown>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const visible = fields.filter((f) => !(row && f.createOnly));
  const [values, setValues] = useState(() => initialValues(visible, row));
  const [local, setLocal] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (payload: Record<string, unknown>) => (row ? adminApi.update(resource, row.id, payload) : adminApi.create(resource, payload)),
    onSuccess: async () => {
      toast.success(row ? 'Modifications enregistrées.' : 'Élément créé.');
      await qc.invalidateQueries({ queryKey: ['admin', resource] });
      await qc.invalidateQueries({ queryKey: ['referentials'] });
      onClose();
    },
  });
  const err = m.isError ? toApiError(m.error) : null;
  const fe = { ...local, ...(err?.fieldErrors ?? {}) };

  const submit = () => {
    const errs: Record<string, string> = {};
    for (const f of visible) {
      const v = values[f.name];
      const req = f.required || (f.requiredOnCreate && !row);
      if (req && f.type !== 'checkbox' && (v === '' || v === undefined)) errs[f.name] = 'Champ obligatoire.';
    }
    setLocal(errs);
    if (Object.keys(errs).length) return;
    const base: Record<string, unknown> = {};
    for (const f of visible) {
      const v = values[f.name];
      if (f.type === 'password' && !v) continue;
      if (f.type === 'number') base[f.name] = v === '' ? null : Number(v);
      else if (f.type === 'select' && v === '') base[f.name] = null;
      else base[f.name] = v === '' ? null : v;
    }
    m.mutate(toPayload ? toPayload(values, row) : base);
  };

  return (
    <Modal open onClose={onClose} title={title} wide>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {err && (
          <InfoBox tone="danger" role="alert">
            {err.message}
          </InfoBox>
        )}
        <div className="formgrid">
          {visible.map((f) => {
            const req = f.required || (f.requiredOnCreate && !row);
            const common = { label: f.label, hint: f.hint, error: fe[f.name], required: req, className: f.full || f.type === 'textarea' ? 'full' : undefined };
            if (f.type === 'checkbox')
              return (
                <label key={f.name} className="check-inline" style={{ marginTop: 20 }}>
                  <input type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.checked }))} />
                  {f.label}
                </label>
              );
            if (f.type === 'select')
              return (
                <Select
                  key={f.name}
                  {...common}
                  placeholder={req ? 'Choisir…' : 'Aucun'}
                  options={f.options ?? []}
                  value={String(values[f.name] ?? '')}
                  onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
                />
              );
            if (f.type === 'textarea')
              return <Textarea key={f.name} {...common} rows={6} value={String(values[f.name] ?? '')} onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))} />;
            return (
              <Input
                key={f.name}
                {...common}
                type={f.type}
                placeholder={f.placeholder}
                autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                value={String(values[f.name] ?? '')}
                onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
              />
            );
          })}
        </div>
        <div className="form-actions" style={{ paddingBottom: 14 }}>
          <Button variant="alt" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={m.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
