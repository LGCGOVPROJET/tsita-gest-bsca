import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  FileText,
  Landmark,
  Lightbulb,
  Mail,
  Mailbox,
  Package,
  Paperclip,
  Pencil,
  Phone,
  PiggyBank,
  PlusCircle,
  Printer,
  Send,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { publicApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { usePublicReferentials } from '@/hooks/useReferentials';
import { formatDateTime, formatDuration, formatLongDate, formatMoney, todayLocal } from '@/lib/format';
import { CURRENCIES, REPLY_CHANNEL_LABELS, REPLY_CHANNELS } from '@/lib/labels';
import { normalizeAmount } from '@/lib/validation';
import { filingSchema, type FilingValues } from './filingSchema';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { FileDrop } from '@/components/ui/FileDrop';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';
import type { PublicComplaintCreated, ReplyChannel } from '@/types/api';
import '@/styles/filing.css';

const STEPS = [
  { key: 'identite', label: 'Identité', desc: 'Vos coordonnées', icon: UserRound, fields: ['full_name', 'email', 'phone', 'customer_number', 'preferred_channel'] },
  { key: 'objet', label: 'Objet', desc: 'Produit et motif', icon: ClipboardList, fields: ['product_id', 'category_id', 'agency_id', 'subject'] },
  { key: 'faits', label: 'Faits', desc: 'Ce qui s’est passé', icon: FileText, fields: ['description', 'operation_date', 'amount', 'currency'] },
  { key: 'pieces', label: 'Pièces', desc: 'Justificatifs', icon: Paperclip, fields: [] },
  { key: 'verification', label: 'Vérification', desc: 'Relecture et envoi', icon: ShieldCheck, fields: ['consent'] },
  { key: 'confirmation', label: 'Confirmation', desc: '', icon: CheckCircle2, fields: [] },
] as const satisfies readonly { key: string; label: string; desc: string; icon: LucideIcon; fields: readonly (keyof FilingValues)[] }[];

const INPUT_STEPS = STEPS.slice(0, 5);

const HELP: Record<string, string> = {
  identite: 'Elles nous permettent de vous identifier et de vous répondre. Votre numéro client est facultatif mais accélère le traitement.',
  objet: 'Choisissez le produit concerné et résumez votre demande en une phrase. En cas de doute sur la nature, laissez « Je ne sais pas » : nos équipes la préciseront.',
  faits: 'Indiquez dates, montants et opérations. Un montant laissé vide sera considéré comme inconnu, jamais comme zéro. Ne communiquez jamais votre code secret.',
  pieces: 'Relevé, reçu, capture d’écran… Facultatif : vous pourrez aussi en ajouter plus tard depuis « Suivre ma demande ».',
  verification: 'Relisez votre demande. Vous pouvez revenir à chaque étape pour corriger une information avant l’envoi.',
};

const CHANNEL_ICONS: Record<string, LucideIcon> = { courriel: Mail, courrier: Mailbox, telephone: Phone };

/** Icône d'un produit déduite de son libellé (le référentiel public ne fournit que id + libellé). */
function productIcon(label: string): LucideIcon {
  const l = label.toLowerCase();
  if (/carte/.test(l)) return CreditCard;
  if (/gab|retrait|distributeur|esp[eè]ce/.test(l)) return Banknote;
  if (/virement|transfert/.test(l)) return ArrowLeftRight;
  if (/mobile|ligne|digital|application|internet/.test(l)) return Smartphone;
  if (/[ée]pargne/.test(l)) return PiggyBank;
  if (/cr[ée]dit|pr[eê]t/.test(l)) return Landmark;
  if (/compte/.test(l)) return Wallet;
  return Package;
}

const MIN_DESCRIPTION = 20;

/**
 * Formulaire public de dépôt en 5 étapes.
 * `compact` : version pour fenêtre modale (même interface, marges réduites).
 */
export function FilingForm({ compact = false }: { compact?: boolean } = {}) {
  const refs = usePublicReferentials();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [files, setFiles] = useState<File[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<PublicComplaintCreated | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevStep = useRef(0);

  const form = useForm<FilingValues>({
    resolver: zodResolver(filingSchema),
    mode: 'onTouched',
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      customer_number: '',
      preferred_channel: 'courriel',
      product_id: '',
      category_id: '',
      agency_id: '',
      subject: '',
      description: '',
      operation_date: '',
      amount: '',
      currency: 'XAF',
      consent: false,
    },
  });
  const { register, formState, trigger, getValues, setError, control } = form;
  const [productId, categoryId, agencyId, description, channel, consent] = useWatch({
    control,
    name: ['product_id', 'category_id', 'agency_id', 'description', 'preferred_channel', 'consent'],
  });
  const errors = formState.errors;

  // Focus sur le titre uniquement quand l'étape change (pas au montage, y compris en mode strict).
  useEffect(() => {
    if (prevStep.current === step) return;
    prevStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  // Avertit avant de quitter la page si une saisie n'a pas encore été envoyée.
  const hasUnsaved = (formState.isDirty || files.length > 0) && !created;
  useEffect(() => {
    if (!hasUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved]);

  const goTo = (target: number) => {
    setDir(target < step ? 'back' : 'fwd');
    setStep(target);
  };

  const startOver = () => {
    form.reset();
    setFiles([]);
    setCreated(null);
    setServerError(null);
    setDir('back');
    setStep(0);
  };

  const current = STEPS[step]!;
  const replyChannels: ReplyChannel[] = refs.data?.channels_reply?.length ? refs.data.channels_reply : REPLY_CHANNELS;

  const next = async () => {
    const ok = await trigger([...current.fields] as (keyof FilingValues)[], { shouldFocus: true });
    if (ok) goTo(step + 1);
  };

  const submit = async () => {
    // Un seul envoi à la fois : évite de créer deux réclamations sur un double clic.
    if (submitting) return;
    setServerError(null);
    const ok = await trigger(undefined, { shouldFocus: true });
    if (!ok) {
      const firstBad = STEPS.findIndex((s) => s.fields.some((f) => form.getFieldState(f).invalid));
      if (firstBad >= 0 && firstBad !== step) goTo(firstBad);
      return;
    }
    setSubmitting(true);
    const v = getValues();
    const fd = new FormData();
    const put = (k: string, val: string | null | undefined) => {
      if (val !== null && val !== undefined && val !== '') fd.append(k, val);
    };
    put('full_name', v.full_name.trim());
    put('email', v.email.trim());
    put('phone', v.phone.trim());
    put('customer_number', v.customer_number.trim());
    put('preferred_channel', v.preferred_channel);
    put('product_id', v.product_id);
    put('category_id', v.category_id);
    put('agency_id', v.agency_id);
    put('subject', v.subject.trim());
    put('description', v.description.trim());
    put('operation_date', v.operation_date);
    const amt = normalizeAmount(v.amount);
    if (amt !== null) {
      fd.append('amount', amt);
      fd.append('currency', v.currency || 'XAF');
    }
    fd.append('consent', '1');
    files.forEach((f) => fd.append('attachments[]', f));

    try {
      const res = await publicApi.createComplaint(fd);
      setCreated(res);
      goTo(5);
    } catch (e) {
      const err = toApiError(e);
      let jumpTo = -1;
      for (const [k, m] of Object.entries(err.fieldErrors)) {
        const key = k.split('.')[0] as keyof FilingValues | 'attachments';
        if (key === 'attachments') {
          jumpTo = jumpTo === -1 ? 3 : Math.min(jumpTo, 3);
          continue;
        }
        if (key in filingSchema.shape) {
          setError(key as keyof FilingValues, { message: m });
          const idx = STEPS.findIndex((s) => (s.fields as readonly string[]).includes(key));
          if (idx >= 0) jumpTo = jumpTo === -1 ? idx : Math.min(jumpTo, idx);
        }
      }
      if (err.status === 429) {
        setServerError(`Trop de demandes envoyées depuis votre connexion. Réessayez dans ${formatDuration(err.retryAfter)} : vos informations sont conservées.`);
      } else if (Object.keys(err.fieldErrors).length) {
        setServerError('Certaines informations doivent être corrigées. Vos données saisies sont conservées.');
        if (err.fieldErrors['attachments'] || Object.keys(err.fieldErrors).some((k) => k.startsWith('attachments'))) {
          setServerError('Une pièce jointe a été refusée (format ou taille). Vos autres informations sont conservées.');
        }
        if (jumpTo >= 0) goTo(jumpTo);
      } else {
        setServerError(`${err.message} Vos informations sont conservées : vous pouvez réessayer.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const product = refs.data?.products.find((p) => String(p.id) === productId);
  const category = refs.data?.categories.find((p) => String(p.id) === categoryId);
  const agency = refs.data?.agencies.find((p) => String(p.id) === agencyId);
  const descLength = (description ?? '').trim().length;
  const StepIcon = current.icon;
  const done = step === 5;
  const pct = done ? 100 : Math.round((step / (INPUT_STEPS.length - 1)) * 100);

  return (
    <div className={`filing${compact ? ' compact' : ''}`} data-dir={dir}>
      <div className="filing-shell">
        {/* ——— Progression ——— */}
        <nav className="filing-rail" aria-label="Étapes du dépôt">
          <ol className="filing-steps">
            {INPUT_STEPS.map((s, i) => {
              const state = done || i < step ? 'done' : i === step ? 'current' : 'todo';
              const Icon = s.icon;
              return (
                <li key={s.key} className={`filing-step-item ${state}`} aria-current={i === step ? 'step' : undefined}>
                  <span className="filing-step-dot" aria-hidden="true">
                    {state === 'done' ? <CheckCircle2 size={18} /> : <Icon size={17} />}
                  </span>
                  <span className="filing-step-text">
                    <span className="filing-step-label">{s.label}</span>
                    <span className="filing-step-desc">{s.desc}</span>
                  </span>
                  <span className="sr-only">{state === 'done' ? ' (terminée)' : state === 'current' ? ' (étape en cours)' : ' (à venir)'}</span>
                </li>
              );
            })}
          </ol>
          <div
            className="filing-progress"
            role="progressbar"
            aria-label="Progression"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={done ? 'Toutes les étapes sont terminées' : `Étape ${step + 1} sur ${INPUT_STEPS.length}`}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="filing-rail-foot">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Données chiffrées. BSCA Bank ne vous demandera jamais votre code secret.</span>
          </div>
        </nav>

        {/* ——— Contenu ——— */}
        <section className="filing-main" aria-labelledby="filing-step-title">
          <header className="filing-head">
            {/* À la confirmation, la grande coche animée remplace l'icône d'étape. */}
            {!done && (
              <span className="filing-head-icon" aria-hidden="true">
                <StepIcon size={22} />
              </span>
            )}
            <h2 id="filing-step-title" ref={headingRef} tabIndex={-1}>
              {done ? (
                'Votre réclamation est enregistrée'
              ) : (
                <>
                  <span className="filing-head-eyebrow">Étape {step + 1} sur 5</span>
                  {' '}
                  <span className="sr-only">·</span>{' '}
                  <span className="filing-head-title">{current.label}</span>
                </>
              )}
            </h2>
          </header>
          {!done && (
            <p className="filing-tip" key={current.key}>
              <Lightbulb size={16} aria-hidden="true" /> <span>{HELP[current.key]}</span>
            </p>
          )}

          <div role="alert" aria-live="assertive">
            {serverError && <InfoBox tone="danger">{serverError}</InfoBox>}
          </div>

          <form
            noValidate
            className="filing-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 4) void next();
              else if (step === 4) void submit();
            }}
          >
            {/* Les étapes restent montées (masquées) pour conserver toutes les saisies. */}
            <div className="filing-panel" hidden={step !== 0}>
              <div className="filing-grid">
                <Input label="Nom et prénom" required autoComplete="name" error={errors.full_name?.message} {...register('full_name')} />
                <Input label="Adresse e-mail" type="email" required autoComplete="email" placeholder="nom@exemple.cg" error={errors.email?.message} {...register('email')} />
                <Input label="Téléphone" type="tel" autoComplete="tel" placeholder="+242 06 000 00 00" hint="Facultatif" error={errors.phone?.message} {...register('phone')} />
                <Input label="Numéro client" hint="Facultatif · figure sur vos relevés" autoComplete="off" error={errors.customer_number?.message} {...register('customer_number')} />
              </div>
              <fieldset className="filing-fieldset">
                <legend>
                  Comment souhaitez-vous recevoir notre réponse ?<span className="req" aria-hidden="true"> *</span>
                </legend>
                <div className="filing-tiles three">
                  {replyChannels.map((ch) => {
                    const Icon = CHANNEL_ICONS[ch] ?? Send;
                    return (
                      <label key={ch} className={`filing-tile${channel === ch ? ' selected' : ''}`}>
                        <input type="radio" value={ch} {...register('preferred_channel')} />
                        <span className="filing-tile-icon" aria-hidden="true">
                          <Icon size={20} />
                        </span>
                        <span className="filing-tile-label">{REPLY_CHANNEL_LABELS[ch] ?? ch}</span>
                        <CheckCircle2 size={16} className="filing-tile-check" aria-hidden="true" />
                      </label>
                    );
                  })}
                </div>
                {errors.preferred_channel && <span className="filing-error">{errors.preferred_channel.message}</span>}
              </fieldset>
            </div>

            <div className="filing-panel" hidden={step !== 1}>
              <fieldset className="filing-fieldset" aria-describedby={errors.product_id ? 'product-error' : undefined}>
                <legend>
                  Produit concerné<span className="req" aria-hidden="true"> *</span>
                </legend>
                {refs.isPending ? (
                  <div className="filing-tiles" aria-busy="true">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="filing-tile skeleton" />
                    ))}
                  </div>
                ) : (
                  <div className="filing-tiles">
                    {(refs.data?.products ?? []).map((p) => {
                      const Icon = productIcon(p.label);
                      const value = String(p.id);
                      return (
                        <label key={p.id} className={`filing-tile${productId === value ? ' selected' : ''}`}>
                          <input type="radio" value={value} {...register('product_id')} aria-invalid={Boolean(errors.product_id) || undefined} />
                          <span className="filing-tile-icon" aria-hidden="true">
                            <Icon size={20} />
                          </span>
                          <span className="filing-tile-label">{p.label}</span>
                          <CheckCircle2 size={16} className="filing-tile-check" aria-hidden="true" />
                        </label>
                      );
                    })}
                  </div>
                )}
                {errors.product_id && (
                  <span id="product-error" className="filing-error">
                    {errors.product_id.message}
                  </span>
                )}
              </fieldset>
              <div className="filing-grid">
                <Select
                  label="Nature de la demande"
                  placeholder="Je ne sais pas"
                  hint="Facultatif"
                  options={(refs.data?.categories ?? []).map((p) => ({ value: p.id, label: p.label }))}
                  {...register('category_id')}
                />
                <Select
                  label="Votre agence"
                  placeholder="Aucune / je ne sais pas"
                  hint="Facultatif"
                  options={(refs.data?.agencies ?? []).map((p) => ({ value: p.id, label: p.name }))}
                  {...register('agency_id')}
                />
              </div>
              <Input
                label="Objet de votre réclamation"
                required
                maxLength={190}
                placeholder="Ex. : paiement par carte débité deux fois"
                error={errors.subject?.message}
                {...register('subject')}
              />
              {refs.isError && <InfoBox tone="warn">Les listes n'ont pas pu être chargées. Actualisez la page.</InfoBox>}
            </div>

            <div className="filing-panel" hidden={step !== 2}>
              <Textarea
                label="Expliquez ce qui s'est passé"
                required
                rows={6}
                maxLength={5000}
                placeholder="Décrivez les faits : quoi, quand, quel montant, quelle opération."
                hint={`${(description ?? '').length} / 5 000 caractères`}
                error={errors.description?.message}
                {...register('description')}
              />
              <div className="filing-meter" aria-hidden="true">
                <span className={descLength >= MIN_DESCRIPTION ? 'ok' : ''} style={{ width: `${Math.min(100, (descLength / MIN_DESCRIPTION) * 100)}%` }} />
              </div>
              <p className={`filing-meter-text${descLength >= MIN_DESCRIPTION ? ' ok' : ''}`} aria-live="polite">
                {descLength >= MIN_DESCRIPTION ? (
                  <>
                    <CheckCircle2 size={14} aria-hidden="true" /> Description suffisante
                  </>
                ) : (
                  `Encore ${MIN_DESCRIPTION - descLength} caractère${MIN_DESCRIPTION - descLength > 1 ? 's' : ''} au minimum`
                )}
              </p>
              <div className="filing-grid">
                <Input label="Date de l'opération" type="date" max={todayLocal()} hint="Facultatif" error={errors.operation_date?.message} {...register('operation_date')} />
                <div className="filing-amount">
                  <Input label="Montant concerné" inputMode="decimal" placeholder="Inconnu" hint="Laisser vide si inconnu" error={errors.amount?.message} {...register('amount')} />
                  <Select label="Devise" options={CURRENCIES.map((c) => ({ value: c, label: c === 'XAF' ? 'FCFA' : c }))} {...register('currency')} />
                </div>
              </div>
            </div>

            <div className="filing-panel" hidden={step !== 3}>
              <FileDrop files={files} onChange={setFiles} label="Ajouter des justificatifs" />
            </div>

            <div className="filing-panel" hidden={step !== 4}>
              <div className="filing-review">
                <ReviewCard icon={UserRound} title="Identité" onEdit={() => goTo(0)}>
                  <strong>{getValues('full_name')}</strong>
                  <span>{getValues('email')}</span>
                  {getValues('phone') && <span className="nowrap">{getValues('phone')}</span>}
                  {getValues('customer_number') && <span>N° client {getValues('customer_number')}</span>}
                  <span>Réponse par : {REPLY_CHANNEL_LABELS[getValues('preferred_channel') as ReplyChannel] ?? getValues('preferred_channel')}</span>
                </ReviewCard>
                <ReviewCard icon={ClipboardList} title="Objet" onEdit={() => goTo(1)}>
                  <strong>{getValues('subject')}</strong>
                  <span>{product?.label ?? '—'}</span>
                  {category && <span>{category.label}</span>}
                  {agency && <span>Agence {agency.name}</span>}
                </ReviewCard>
                <ReviewCard icon={FileText} title="Faits" onEdit={() => goTo(2)} wide>
                  <span className="pre-wrap">{getValues('description')}</span>
                  <span>
                    Date de l'opération : {getValues('operation_date') ? formatLongDate(getValues('operation_date'), '—') : 'non précisée'}
                  </span>
                  <span>Montant : {formatMoney(normalizeAmount(getValues('amount')), getValues('currency'))}</span>
                </ReviewCard>
                <ReviewCard icon={Paperclip} title="Pièces" onEdit={() => goTo(3)} wide>
                  <span>{files.length ? files.map((f) => f.name).join(', ') : 'Aucune pièce jointe'}</span>
                </ReviewCard>
              </div>
              <label className={`filing-consent${consent ? ' checked' : ''}${errors.consent ? ' invalid' : ''}`}>
                <input
                  type="checkbox"
                  {...register('consent')}
                  aria-invalid={Boolean(errors.consent) || undefined}
                  aria-describedby={errors.consent ? 'consent-error' : undefined}
                />
                <span className="filing-consent-box" aria-hidden="true">
                  <CheckCircle2 size={16} />
                </span>
                <span>
                  J'accepte que BSCA Bank traite les informations fournies pour instruire ma réclamation et me répondre.
                  <span className="req" aria-hidden="true"> *</span>
                </span>
              </label>
              {errors.consent && (
                <p id="consent-error" className="filing-error">
                  {errors.consent.message}
                </p>
              )}
            </div>

            {!done && (
              <div className="filing-actions">
                {step > 0 ? (
                  <Button variant="alt" disabled={submitting} icon={<ArrowLeft size={16} aria-hidden="true" />} onClick={() => goTo(step - 1)}>
                    Précédent
                  </Button>
                ) : (
                  <span className="filing-actions-note">5 étapes · environ 3 minutes</span>
                )}
                {step < 4 ? (
                  <Button type="submit" className="filing-next">
                    Continuer <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                ) : (
                  <Button type="submit" className="filing-next" loading={submitting} icon={submitting ? undefined : <Send size={16} aria-hidden="true" />}>
                    {submitting ? (
                      'Envoi en cours…'
                    ) : (
                      <>
                        Envoyer{' '}
                        <span className="filing-long">ma réclamation</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </form>

          {done && created && <Confirmation created={created} onNew={startOver} />}

          {!compact && !done && (
            <p className="filing-foot">
              Déjà déposé une réclamation ? <Link to="/suivi">Suivre ma demande</Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function ReviewCard({ icon: Icon, title, onEdit, wide, children }: { icon: LucideIcon; title: string; onEdit: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`filing-review-card${wide ? ' wide' : ''}`} aria-label={title}>
      <header>
        <span className="filing-review-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <h3>{title}</h3>
        <button type="button" className="filing-edit" onClick={onEdit} aria-label={`Modifier : ${title}`}>
          <Pencil size={13} aria-hidden="true" /> Modifier
        </button>
      </header>
      <div className="filing-review-body">{children}</div>
    </section>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="alt"
      size="sm"
      icon={copied ? <CheckCircle2 size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          /* presse-papiers indisponible : l'utilisateur peut recopier à la main */
        }
      }}
      aria-label={`Copier ${label}`}
    >
      {copied ? 'Copié' : 'Copier'}
    </Button>
  );
}

function Confirmation({ created, onNew }: { created: PublicComplaintCreated; onNew: () => void }) {
  return (
    <div className="filing-confirm">
      <div className="filing-confirm-hero">
        <svg className="filing-check" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="24" />
          <path d="M15 27 l7 7 l15 -16" />
        </svg>
        <p className="sub">Reçue le {formatDateTime(created.received_at)}. Un accusé de réception vous sera adressé.</p>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <div className="secret-box">
          <div>
            <div className="secret-label">Référence</div>
            <div className="secret-value">{created.reference}</div>
          </div>
          <CopyButton value={created.reference} label="la référence" />
        </div>
        <div className="secret-box accent">
          <div>
            <div className="secret-label">Code de suivi</div>
            <div className="secret-value">{created.tracking_code}</div>
          </div>
          <CopyButton value={created.tracking_code} label="le code de suivi" />
        </div>
      </div>
      <InfoBox tone="warn" role="alert">
        <strong>Notez ou imprimez ce code maintenant.</strong> Pour votre sécurité, il n'est affiché qu'une seule fois et ne peut pas être
        renvoyé. Il vous sera demandé avec la référence pour suivre votre demande.
      </InfoBox>
      <h3>Délais annoncés</h3>
      <dl className="stats">
        <div className="stat">
          <dt>Accusé de réception au plus tard le</dt>
          <dd>{formatLongDate(created.acknowledgment_due_at, 'À confirmer')}</dd>
        </div>
        <div className="stat">
          <dt>Réponse définitive au plus tard le</dt>
          <dd>{formatLongDate(created.final_response_due_at, 'À confirmer')}</dd>
        </div>
      </dl>
      {created.rule_is_demo && (
        <InfoBox tone="warn">Règle de démonstration — non validée par la conformité BSCA. Les délais indiqués sont illustratifs.</InfoBox>
      )}
      <div className="form-actions confirm-actions">
        <Button variant="alt" icon={<Printer size={15} aria-hidden="true" />} onClick={() => window.print()}>
          Imprimer
        </Button>
        <Link className="btn" to={`/suivi?reference=${encodeURIComponent(created.reference)}`}>
          Suivre ma demande
        </Link>
      </div>
      <p className="filing-new">
        <button type="button" className="link-btn" onClick={onNew}>
          <PlusCircle size={15} aria-hidden="true" /> Déposer une autre réclamation
        </button>
      </p>
    </div>
  );
}
