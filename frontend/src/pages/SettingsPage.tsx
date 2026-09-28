import { useSearchParams } from 'react-router';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import { can, canAny } from '@/lib/permissions';
import { useReferentials } from '@/hooks/useReferentials';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDate, formatDateTime, actorName } from '@/lib/format';
import {
  ROLE_LABELS,
  RULE_KIND_LABELS,
  RULE_SOURCE_LABELS,
  RULE_STATUS_LABELS,
  RULE_UNIT_LABELS,
  TEMPLATE_KIND_LABELS,
  toOptions,
} from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, RuleStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast-context';
import { CrudSection, type FieldDef } from '@/features/admin/CrudSection';
import { AuditLogSection } from '@/features/admin/AuditLogSection';
import { ADMIN_SECTIONS, type AdminTabKey } from '@/features/admin/adminSections';
import { ImportsSection } from '@/features/admin/ImportsSection';
import type { AdminUser, Agency, Category, DeadlineRule, Entity, Holiday, Product, ResponseTemplate } from '@/types/api';

type TabKey = AdminTabKey;

const active = (v: boolean | undefined) => (v === false ? <Badge tone="neutral">Inactif</Badge> : <Badge tone="success">Actif</Badge>);

export default function SettingsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = ADMIN_SECTIONS.filter((sec) => canAny(user, ...sec.anyOf));
  const requested = params.get('onglet') as TabKey | null;
  const current: TabKey = tabs.find((t) => t.key === requested)?.key ?? tabs[0]?.key ?? 'audit';
  const currentLabel = tabs.find((t) => t.key === current)?.label ?? 'Paramètres';
  useDocumentTitle(`${currentLabel} — Paramètres`);

  return (
    <>
      <PageHeader
        eyebrow={`Administration · ${currentLabel}`}
        title="Paramètres de la plateforme"
        sub="Référentiels, comptes et règles soumis à validation BSCA. Toutes les modifications sont journalisées."
      />
      <div className="settings-layout">
        {/* Sur ordinateur, les rubriques sont dans la barre latérale ; sur téléphone, cette liste déroulante les remplace. */}
        <nav className="card settings-nav" aria-label="Rubriques d'administration">
          <div className="settings-select">
            <label className="label-text" htmlFor="settings-rubrique">
              Rubrique
            </label>
            <select id="settings-rubrique" value={current} onChange={(e) => setParams({ onglet: e.target.value }, { replace: true })}>
              {tabs.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </nav>
        <section className="card tabpanel" aria-label={currentLabel}>
          {current === 'utilisateurs' && <UsersTab />}
          {current === 'agences' && (
            <CrudSection<Agency>
              resource="agencies"
              title="Agences"
              description="Agences de réception. L'agence de dépôt reste distincte de la fonction de traitement."
              newLabel="Ajouter une agence"
              itemLabel={(a) => a.name}
              columns={[
                { key: 'code', header: 'Code', render: (a) => <code>{a.code}</code> },
                { key: 'name', header: 'Nom', mobileTitle: true, render: (a) => a.name },
                { key: 'city', header: 'Ville', render: (a) => a.city ?? '—' },
                { key: 'active', header: 'Statut', render: (a) => active(a.is_active) },
              ]}
              fields={[
                { name: 'code', label: 'Code', type: 'text', required: true },
                { name: 'name', label: 'Nom', type: 'text', required: true },
                { name: 'city', label: 'Ville', type: 'text', required: true },
                { name: 'is_active', label: 'Active', type: 'checkbox' },
              ]}
            />
          )}
          {current === 'entites' && (
            <CrudSection<Entity>
              resource="entities"
              title="Entités de traitement"
              description="Fonctions qui instruisent et résolvent les réclamations."
              newLabel="Ajouter une entité"
              itemLabel={(a) => a.name}
              columns={[
                { key: 'code', header: 'Code', render: (a) => <code>{a.code}</code> },
                { key: 'name', header: 'Nom', mobileTitle: true, render: (a) => a.name },
                { key: 'active', header: 'Statut', render: (a) => active(a.is_active) },
              ]}
              fields={[
                { name: 'code', label: 'Code', type: 'text', required: true },
                { name: 'name', label: 'Nom', type: 'text', required: true },
                { name: 'is_active', label: 'Active', type: 'checkbox' },
              ]}
            />
          )}
          {current === 'categories' && (
            <CrudSection<Category>
              resource="categories"
              title="Catégories (nature des réclamations)"
              description="Référentiel versionné : une modification crée une nouvelle version."
              newLabel="Ajouter une catégorie"
              itemLabel={(a) => a.label}
              columns={[
                { key: 'code', header: 'Code', render: (a) => <code>{a.code}</code> },
                {
                  key: 'label',
                  header: 'Libellé',
                  mobileTitle: true,
                  render: (a) => (
                    <>
                      {a.label}
                      {a.description && <span className="cell-sub">{a.description}</span>}
                    </>
                  ),
                },
                { key: 'version', header: 'Version', render: (a) => (a.version ? `v${a.version}` : '—') },
                { key: 'active', header: 'Statut', render: (a) => active(a.is_active) },
              ]}
              fields={[
                { name: 'code', label: 'Code', type: 'text', required: true },
                { name: 'label', label: 'Libellé', type: 'text', required: true },
                { name: 'description', label: 'Description', type: 'textarea' },
                { name: 'is_active', label: 'Active', type: 'checkbox' },
              ]}
            />
          )}
          {current === 'produits' && (
            <CrudSection<Product>
              resource="products"
              title="Produits"
              newLabel="Ajouter un produit"
              itemLabel={(a) => a.label}
              columns={[
                { key: 'code', header: 'Code', render: (a) => <code>{a.code}</code> },
                { key: 'label', header: 'Libellé', mobileTitle: true, render: (a) => a.label },
                { key: 'active', header: 'Statut', render: (a) => active(a.is_active) },
              ]}
              fields={[
                { name: 'code', label: 'Code', type: 'text', required: true },
                { name: 'label', label: 'Libellé', type: 'text', required: true },
                { name: 'is_active', label: 'Actif', type: 'checkbox' },
              ]}
            />
          )}
          {current === 'regles' && <RulesTab />}
          {current === 'feries' && (
            <CrudSection<Holiday>
              resource="holidays"
              title="Jours fériés (République du Congo)"
              description="Calendrier versionné utilisé pour les délais en jours ouvrés."
              newLabel="Ajouter un jour férié"
              canDelete
              itemLabel={(h) => `${h.label} (${formatDate(h.date)})`}
              columns={[
                { key: 'date', header: 'Date', render: (h) => formatDate(h.date) },
                { key: 'label', header: 'Libellé', mobileTitle: true, render: (h) => h.label },
                { key: 'version', header: 'Calendrier', render: (h) => `v${h.calendar_version}` },
                { key: 'country', header: 'Pays', render: (h) => h.country },
              ]}
              fields={[
                { name: 'date', label: 'Date', type: 'date', required: true },
                { name: 'label', label: 'Libellé', type: 'text', required: true },
                { name: 'calendar_version', label: 'Version du calendrier', type: 'text', required: true, defaultValue: '1' },
                { name: 'country', label: 'Pays', type: 'text', required: true, defaultValue: 'CG' },
              ]}
            />
          )}
          {current === 'modeles' && (
            <CrudSection<ResponseTemplate>
              resource="templates"
              title="Modèles de réponse"
              description="Accusé, attente, réponse et clôture. Champs dynamiques : {{reference}}, {{client}}, {{date_limite}}."
              newLabel="Ajouter un modèle"
              itemLabel={(t) => t.label}
              columns={[
                { key: 'code', header: 'Code', render: (t) => <code>{t.code}</code> },
                { key: 'kind', header: 'Type', render: (t) => TEMPLATE_KIND_LABELS[t.kind] ?? t.kind },
                {
                  key: 'label',
                  header: 'Libellé',
                  mobileTitle: true,
                  render: (t) => (
                    <>
                      {t.label}
                      <span className="cell-sub">{t.subject}</span>
                    </>
                  ),
                },
                { key: 'version', header: 'Version', render: (t) => `v${t.version}` },
                { key: 'active', header: 'Statut', render: (t) => active(t.is_active) },
              ]}
              fields={[
                { name: 'code', label: 'Code', type: 'text', required: true },
                { name: 'kind', label: 'Type', type: 'select', required: true, options: toOptions(TEMPLATE_KIND_LABELS) },
                { name: 'label', label: 'Libellé', type: 'text', required: true },
                { name: 'subject', label: 'Objet du message', type: 'text', required: true },
                {
                  name: 'body',
                  label: 'Corps du message',
                  type: 'textarea',
                  required: true,
                  hint: 'Texte brut. Utilisez {{reference}}, {{client}}, {{date_limite}}.',
                },
                { name: 'is_active', label: 'Actif', type: 'checkbox' },
              ]}
            />
          )}
          {current === 'audit' && <AuditLogSection />}
          {current === 'imports' && <ImportsSection />}
        </section>
      </div>
    </>
  );
}

function UsersTab() {
  const ref = useReferentials();
  const qc = useQueryClient();
  const toast = useToast();
  const act = useMutation({
    mutationFn: (p: { id: number; payload: Record<string, unknown>; ok: string }) => adminApi.update('users', p.id, p.payload),
    onSuccess: async (_r, p) => {
      toast.success(p.ok);
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => toast.error(toApiError(e).message),
  });
  const fields: FieldDef[] = [
    { name: 'name', label: 'Nom complet', type: 'text', required: true },
    { name: 'email', label: 'Adresse e-mail', type: 'email', required: true },
    { name: 'role', label: 'Rôle', type: 'select', required: true, options: toOptions(ROLE_LABELS) },
    { name: 'phone', label: 'Téléphone', type: 'text' },
    {
      name: 'agency_id',
      label: 'Agence',
      type: 'select',
      options: (ref.data?.agencies ?? []).map((a) => ({ value: a.id, label: a.name })),
      hint: 'Périmètre des agents d’accueil.',
    },
    {
      name: 'entity_id',
      label: 'Entité de traitement',
      type: 'select',
      options: (ref.data?.entities ?? []).map((a) => ({ value: a.id, label: a.name })),
      hint: 'Périmètre des gestionnaires et responsables.',
    },
    {
      name: 'password',
      label: 'Mot de passe initial',
      type: 'password',
      requiredOnCreate: true,
      hint: '12 caractères min. avec majuscule, minuscule, chiffre et symbole. Laisser vide pour ne pas changer.',
    },
    { name: 'is_active', label: 'Compte actif', type: 'checkbox' },
  ];
  return (
    <CrudSection<AdminUser>
      extraActions={(u) => (
        <>
          {u.locked_until && new Date(u.locked_until) > new Date() && (
            <Button
              size="sm"
              variant="alt"
              loading={act.isPending && act.variables?.id === u.id}
              onClick={() => act.mutate({ id: u.id, payload: { unlock: true }, ok: `Compte de ${u.name} déverrouillé.` })}
            >
              Déverrouiller
            </Button>
          )}
          {u.mfa_enabled && (
            <Button
              size="sm"
              variant="alt"
              loading={act.isPending && act.variables?.id === u.id}
              onClick={() => {
                if (
                  window.confirm(
                    `Réinitialiser la double authentification de ${u.name} ? Ses sessions seront fermées et il devra la reconfigurer.`,
                  )
                )
                  act.mutate({ id: u.id, payload: { reset_mfa: true }, ok: `MFA de ${u.name} réinitialisée.` });
              }}
            >
              Réinitialiser la MFA
            </Button>
          )}
        </>
      )}
      resource="users"
      title="Utilisateurs"
      description="Comptes, rôles et périmètres. Un administrateur ne traite pas de dossier (séparation des responsabilités)."
      newLabel="Ajouter un utilisateur"
      itemLabel={(u) => u.name}
      fields={fields}
      columns={[
        {
          key: 'name',
          header: 'Nom',
          mobileTitle: true,
          render: (u) => (
            <>
              {u.name}
              <span className="cell-sub">{u.email}</span>
            </>
          ),
        },
        { key: 'role', header: 'Rôle', render: (u) => u.role_label ?? ROLE_LABELS[u.role] ?? u.role },
        { key: 'scope', header: 'Périmètre', render: (u) => u.agency?.name ?? u.entity?.name ?? '—' },
        {
          key: 'mfa',
          header: 'MFA',
          render: (u) =>
            u.mfa_enabled ? (
              <Badge tone="success" icon={ShieldCheck}>
                Active
              </Badge>
            ) : (
              <Badge tone="outline">Inactive</Badge>
            ),
        },
        {
          key: 'status',
          header: 'Statut',
          render: (u) =>
            u.locked_until && new Date(u.locked_until) > new Date() ? (
              <Badge tone="warn">Verrouillé jusqu'à {formatDateTime(u.locked_until)}</Badge>
            ) : (
              active(u.is_active)
            ),
        },
        { key: 'last', header: 'Dernière connexion', render: (u) => formatDateTime(u.last_login_at, 'Jamais') },
      ]}
    />
  );
}

function RulesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const validate = useMutation({
    mutationFn: (id: number) => adminApi.validateRule(id),
    onSuccess: async () => {
      toast.success('Règle validée par la conformité. Elle est désormais applicable.');
      await qc.invalidateQueries({ queryKey: ['admin', 'deadline-rules'] });
    },
    onError: (e) => toast.error(toApiError(e).message),
  });
  const canValidate = can(user, 'admin.rules.validate');
  const canEdit = can(user, 'admin.rules');
  const [toValidate, setToValidate] = useState<DeadlineRule | null>(null);

  const fields: FieldDef[] = [
    { name: 'code', label: 'Code', type: 'text', required: true },
    { name: 'label', label: 'Libellé', type: 'text', required: true },
    { name: 'kind', label: 'Type de délai', type: 'select', required: true, options: toOptions(RULE_KIND_LABELS) },
    { name: 'unit', label: 'Unité', type: 'select', required: true, options: toOptions(RULE_UNIT_LABELS) },
    { name: 'duration', label: 'Durée (jours)', type: 'number', required: true },
    {
      name: 'start_point',
      label: 'Point de départ',
      type: 'select',
      required: true,
      options: [{ value: 'received_at', label: 'Date de réception' }],
      defaultValue: 'received_at',
    },
    { name: 'source_type', label: 'Type de source', type: 'select', required: true, options: toOptions(RULE_SOURCE_LABELS) },
    { name: 'source_reference', label: 'Référence de la source', type: 'text', hint: 'Texte juridique ou procédure interne.' },
    { name: 'effective_from', label: "Date d'effet", type: 'date', required: true },
    { name: 'effective_to', label: 'Fin de validité', type: 'date' },
    {
      name: 'status',
      label: 'Statut',
      type: 'select',
      required: true,
      options: toOptions(RULE_STATUS_LABELS).filter((o) => o.value !== 'valide'),
      hint: 'La validation est réservée à la conformité.',
      defaultValue: 'brouillon',
    },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];

  return (
    <>
      <CrudSection<DeadlineRule>
        resource="deadline-rules"
        title="Règles de délai"
        description="Chaque règle porte sa source, sa date d'effet, son unité et sa version. Seules les règles validées s'appliquent."
        newLabel="Ajouter une règle"
        itemLabel={(r) => r.label}
        fields={fields}
        notice={
          <InfoBox tone="warn">
            Les règles de démonstration (AR 10 jours ouvrés, réponse 45 jours calendaires) ne constituent pas un engagement BSCA tant que la
            conformité ne les a pas validées.
          </InfoBox>
        }
        columns={[
          {
            key: 'label',
            header: 'Règle',
            mobileTitle: true,
            render: (r) => (
              <>
                {r.label}
                <span className="cell-sub">
                  {RULE_KIND_LABELS[r.kind] ?? r.kind} · <code>{r.code}</code>
                </span>
              </>
            ),
          },
          { key: 'dur', header: 'Durée', render: (r) => `${r.duration} ${r.unit === 'business' ? 'j. ouvrés' : 'j. calendaires'}` },
          {
            key: 'source',
            header: 'Source',
            render: (r) => (
              <>
                {RULE_SOURCE_LABELS[r.source_type] ?? r.source_type}
                {r.source_reference && <span className="cell-sub">{r.source_reference}</span>}
              </>
            ),
          },
          {
            key: 'eff',
            header: 'Effet',
            render: (r) => (
              <>
                du {formatDate(r.effective_from)}
                {r.effective_to && <span className="cell-sub">au {formatDate(r.effective_to)}</span>}
              </>
            ),
          },
          { key: 'version', header: 'Version', render: (r) => `v${r.version}` },
          {
            key: 'status',
            header: 'Validation',
            render: (r) => (
              <>
                <RuleStatusBadge status={r.status} />
                {r.validated_at && (
                  <span className="cell-sub">
                    par {actorName(r.validated_by)} le {formatDate(r.validated_at)}
                  </span>
                )}
              </>
            ),
          },
        ]}
        extraActions={(r) =>
          canValidate && r.status === 'a_valider' ? (
            <Button
              size="sm"
              variant="success"
              loading={validate.isPending && validate.variables === r.id}
              onClick={() => setToValidate(r)}
              aria-label={`Valider la règle ${r.label}`}
            >
              Valider
            </Button>
          ) : null
        }
        searchable={canEdit}
        readOnly={!canEdit}
      />
      <Modal
        open={toValidate !== null}
        onClose={() => setToValidate(null)}
        title="Valider cette règle de délai ?"
        description={toValidate ? `${toValidate.label} · v${toValidate.version}` : undefined}
      >
        {toValidate && (
          <>
            <section className="effect-summary" aria-label="Effet de la validation">
              <h3>Ce qui va se passer</h3>
              <ul>
                <li>
                  La règle{' '}
                  <b>
                    {toValidate.duration} {toValidate.unit === 'business' ? 'jours ouvrés' : 'jours calendaires'}
                  </b>{' '}
                  ({RULE_KIND_LABELS[toValidate.kind] ?? toValidate.kind}) devient applicable à partir du{' '}
                  <b>{formatDate(toValidate.effective_from)}</b>.
                </li>
                <li>
                  Source : {RULE_SOURCE_LABELS[toValidate.source_type] ?? toValidate.source_type}
                  {toValidate.source_reference ? ` — ${toValidate.source_reference}` : ' — aucune référence renseignée'}.
                </li>
                <li>Votre nom et la date de validation sont enregistrés ; toute évolution créera une nouvelle version.</li>
              </ul>
            </section>
            {toValidate.source_type === 'demonstration' && (
              <div className="confirm-step" role="alert">
                <h3>
                  <AlertTriangle size={17} aria-hidden="true" /> Règle de démonstration
                </h3>
                <p>
                  Cette règle est d'origine « démonstration ». Validez-la seulement si ses seuils ont été confirmés par les textes
                  applicables à BSCA.
                </p>
              </div>
            )}
            <div className="form-actions" style={{ paddingBottom: 14 }}>
              <Button variant="alt" onClick={() => setToValidate(null)}>
                Annuler
              </Button>
              <Button
                variant="success"
                loading={validate.isPending}
                onClick={() => validate.mutate(toValidate.id, { onSettled: () => setToValidate(null) })}
              >
                Valider la règle
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
