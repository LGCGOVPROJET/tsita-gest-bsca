import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { complaintsApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useAuth } from '@/lib/auth-context';
import { useReferentials } from '@/hooks/useReferentials';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { localInputToIso, nowLocalInput } from '@/lib/format';
import { CURRENCIES, REPLY_CHANNEL_LABELS, REPLY_CHANNELS } from '@/lib/labels';
import { normalizeAmount, optionalAmount } from '@/lib/validation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { FileDrop } from '@/components/ui/FileDrop';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';
import { useToast } from '@/components/ui/toast-context';
import { Timeline } from '@/components/ui/Timeline';
import { CustomerSearch } from '@/features/complaint/CustomerSearch';
import { TrackingCodeModal } from '@/features/complaint/TrackingCodeModal';
import type { CustomerMatch } from '@/api/endpoints';

const schema = z.object({
  channel: z.string().min(1, "Choisissez le canal d'origine."),
  received_at: z
    .string()
    .min(1, 'Indiquez la date effective de réception.')
    .refine((v) => v <= nowLocalInput(), 'La date de réception ne peut pas être dans le futur.'),
  receiving_agency_id: z.string(),
  full_name: z.string().trim().min(2, 'Indiquez le nom du client.'),
  email: z.string().trim().email('Adresse e-mail invalide.').or(z.literal('')),
  phone: z.string().trim().max(30),
  customer_number: z.string().trim().max(40).regex(/^[A-Za-z0-9-]*$/, 'Lettres, chiffres et tirets uniquement.'),
  preferred_channel: z.string().min(1, 'Choisissez le canal de réponse.'),
  subject: z.string().trim().min(5, "L'objet doit comporter au moins 5 caractères.").max(190, '190 caractères maximum.'),
  description: z.string().trim().min(20, 'Décrivez les faits (20 caractères minimum).'),
  operation_date: z.string(),
  product_id: z.string().min(1, 'Choisissez le produit concerné.'),
  category_id: z.string(),
  amount: optionalAmount,
  currency: z.string(),
  consent: z.literal(true, { message: 'Le consentement du client est requis.' }),
});
type Values = z.infer<typeof schema>;

export default function ComplaintNewPage() {
  useDocumentTitle('Nouvelle réclamation');
  const { user } = useAuth();
  const ref = useReferentials();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerMatch | null>(null);
  const [created, setCreated] = useState<{ id: number; reference: string; code: string } | null>(null);

  const { register, handleSubmit, formState, setError, control, setValue } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      channel: 'agence',
      received_at: nowLocalInput(),
      receiving_agency_id: user?.agency ? String(user.agency.id) : '',
      full_name: '',
      email: '',
      phone: '',
      customer_number: '',
      preferred_channel: 'courriel',
      subject: '',
      description: '',
      operation_date: '',
      product_id: '',
      category_id: '',
      amount: '',
      currency: 'XAF',
      consent: undefined as unknown as true,
    },
  });
  const errors = formState.errors;
  const amount = useWatch({ control, name: 'amount' });

  const onSubmit = async (v: Values) => {
    setServerError(null);
    const fd = new FormData();
    const put = (k: string, val: string | null | undefined) => {
      if (val !== null && val !== undefined && val !== '') fd.append(k, val);
    };
    if (customer) fd.append('customer_id', String(customer.id));
    put('channel', v.channel);
    put('received_at', localInputToIso(v.received_at));
    put('receiving_agency_id', v.receiving_agency_id);
    put('full_name', v.full_name);
    put('email', v.email);
    put('phone', v.phone);
    put('customer_number', v.customer_number);
    put('preferred_channel', v.preferred_channel);
    put('subject', v.subject);
    put('description', v.description);
    put('operation_date', v.operation_date);
    put('product_id', v.product_id);
    put('category_id', v.category_id);
    const amt = normalizeAmount(v.amount);
    if (amt !== null) {
      fd.append('amount', amt);
      fd.append('currency', v.currency || 'XAF');
    }
    fd.append('consent', '1');
    files.forEach((f) => fd.append('attachments[]', f));

    try {
      const { complaint, trackingCode } = await complaintsApi.create(fd);
      await qc.invalidateQueries({ queryKey: ['complaints'] });
      toast.success(`Dossier ${complaint.reference} enregistré.`);
      if (trackingCode) setCreated({ id: complaint.id, reference: complaint.reference, code: trackingCode });
      else navigate(`/app/reclamations/${complaint.id}`);
    } catch (e) {
      const err = toApiError(e);
      let mapped = 0;
      for (const [k, m] of Object.entries(err.fieldErrors)) {
        const key = (k === 'customer_id' ? 'full_name' : k.split('.')[0]) as keyof Values;
        if (key in schema.shape) {
          setError(key, { message: m });
          mapped++;
        }
      }
      setServerError(mapped ? 'Certaines informations doivent être corrigées (voir les champs signalés).' : err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const r = ref.data;

  return (
    <>
      <PageHeader
        eyebrow="Saisie omnicanale"
        title="Enregistrer une réclamation"
        sub="Pour une demande reçue en agence, par téléphone, courriel ou courrier. Les données saisies sont conservées en cas d'erreur."
        actions={
          <Link className="btn alt" to="/app/reclamations">
            Annuler
          </Link>
        }
      />
      <div role="alert">{serverError && <InfoBox tone="danger">{serverError}</InfoBox>}</div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="twocol">
          <div className="stack">
            <Card title="Réception">
              <div className="formgrid">
                <Select label="Canal d'origine" required options={(r?.channels ?? []).map((c) => ({ value: c.code, label: c.label }))} error={errors.channel?.message} {...register('channel')} />
                <Input label="Date effective de réception" type="datetime-local" required max={nowLocalInput()} hint="Heure de Brazzaville. Point de départ des délais." error={errors.received_at?.message} {...register('received_at')} />
                <Select
                  label="Agence de réception"
                  placeholder="Non applicable"
                  options={(r?.agencies ?? []).map((a) => ({ value: a.id, label: a.name }))}
                  hint="Distincte de la fonction qui traitera le dossier."
                  {...register('receiving_agency_id')}
                />
              </div>
            </Card>

            <Card title="Client">
              <CustomerSearch
                selected={customer}
                onSelect={(c) => {
                  setCustomer(c);
                  if (c) {
                    const opts = { shouldValidate: true, shouldDirty: true };
                    setValue('full_name', c.full_name, opts);
                    setValue('email', c.email ?? '', opts);
                    setValue('phone', c.phone ?? '', opts);
                    setValue('customer_number', '', opts);
                    if (c.preferred_channel) setValue('preferred_channel', c.preferred_channel === 'email' ? 'courriel' : c.preferred_channel, opts);
                  }
                }}
              />
              <div className="formgrid">
                <Input label="Nom complet" required autoComplete="off" error={errors.full_name?.message} {...register('full_name')} />
                <Input label="Adresse e-mail" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
                <Input label="Téléphone" type="tel" autoComplete="off" placeholder="+242 06 000 00 00" error={errors.phone?.message} {...register('phone')} />
                <Input label="Numéro client" hint={customer ? 'Déjà connu pour ce client (masqué).' : 'Facultatif · stocké chiffré.'} disabled={Boolean(customer)} autoComplete="off" error={errors.customer_number?.message} {...register('customer_number')} />
                <Select
                  label="Canal de réponse préféré"
                  required
                  options={REPLY_CHANNELS.map((value) => ({ value, label: REPLY_CHANNEL_LABELS[value] }))}
                  error={errors.preferred_channel?.message}
                  {...register('preferred_channel')}
                />
              </div>
            </Card>

            <Card title="Réclamation">
              <Input label="Objet" required maxLength={190} error={errors.subject?.message} {...register('subject')} />
              <Textarea label="Faits exposés par le client" required rows={6} hint="Reprenez les faits tels que décrits, avec les dates utiles." error={errors.description?.message} {...register('description')} />
              <div className="formgrid">
                <Select label="Produit concerné" required placeholder="Choisir…" options={(r?.products ?? []).map((p) => ({ value: p.id, label: p.label }))} error={errors.product_id?.message} {...register('product_id')} />
                <Select label="Catégorie" placeholder="À qualifier" options={(r?.categories ?? []).map((p) => ({ value: p.id, label: p.label }))} {...register('category_id')} />
                <Input label="Date de l'opération" type="date" {...register('operation_date')} />
                <div className="formgrid" style={{ gap: '0 10px' }}>
                  <Input label="Montant" inputMode="decimal" placeholder="Inconnu" hint="Laisser vide si inconnu." error={errors.amount?.message} {...register('amount')} />
                  <Select label="Devise" options={CURRENCIES.map((c) => ({ value: c, label: c === 'XAF' ? 'XAF (FCFA)' : c }))} disabled={!amount} {...register('currency')} />
                </div>
              </div>
            </Card>

            <Card title="Pièces justificatives">
              <FileDrop files={files} onChange={setFiles} />
            </Card>

            <Card>
              <label className="check-inline" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" {...register('consent')} aria-invalid={Boolean(errors.consent) || undefined} aria-describedby="consent-err" />
                <span>Le client a été informé et consent au traitement de ses données personnelles pour l'instruction de sa réclamation.</span>
              </label>
              {errors.consent && (
                <p id="consent-err" className="field error" style={{ margin: '6px 0 0', color: 'var(--danger)' }}>
                  {errors.consent.message}
                </p>
              )}
              <div className="form-actions">
                <Link className="btn alt" to="/app/reclamations">
                  Annuler
                </Link>
                <Button type="submit" loading={formState.isSubmitting}>
                  Enregistrer le dossier
                </Button>
              </div>
            </Card>
          </div>

          <aside className="stack">
            <Card title="Après l'enregistrement">
              <Timeline
                items={[
                  { key: 1, title: 'Référence attribuée', meta: 'TG-BSCA-AAAA-NNNNNN, non signifiante' },
                  { key: 2, title: 'Accusé de réception', meta: 'À envoyer et tracer depuis le dossier' },
                  { key: 3, title: 'Qualification', meta: 'Nature, produit, fonction de traitement, montant' },
                  { key: 4, title: 'Affectation', meta: 'Propriétaire unique et suppléant', variant: 'pending' },
                ]}
              />
            </Card>
            <InfoBox tone="info">
              L'échéance est calculée à partir de la <strong>date effective de réception</strong>, et non de la date de saisie. Un montant
              non renseigné reste « Inconnu », jamais égal à zéro.
            </InfoBox>
          </aside>
        </div>
      </form>
      {created && (
        <TrackingCodeModal
          reference={created.reference}
          code={created.code}
          onClose={() => navigate(`/app/reclamations/${created.id}`)}
        />
      )}
    </>
  );
}
