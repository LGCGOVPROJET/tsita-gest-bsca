/** Formatage FR — fuseau Africa/Brazzaville (UTC+1, sans heure d'été). */
export const TZ = 'Africa/Brazzaville';
export const LOCALE = 'fr-FR';

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // Date seule AAAA-MM-JJ : on l'interprète comme midi local Brazzaville pour éviter les décalages de jour.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+01:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const longDateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const isoDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 28/09/2026 */
export function formatDate(value: string | Date | null | undefined, empty = '—'): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : empty;
}

/** 28 septembre 2026 */
export function formatLongDate(value: string | Date | null | undefined, empty = '—'): string {
  const d = toDate(value);
  return d ? longDateFmt.format(d) : empty;
}

/** 28/09/2026 14:05 */
export function formatDateTime(value: string | Date | null | undefined, empty = '—'): string {
  const d = toDate(value);
  if (!d) return empty;
  const parts = dateTimeFmt.formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} à ${get('hour')}:${get('minute')}`;
}

/** Date du jour à Brazzaville au format AAAA-MM-JJ. */
export function todayLocal(now: Date = new Date()): string {
  return isoDayFmt.format(now);
}

/** Décale une date AAAA-MM-JJ de n jours. */
export function addDays(isoDay: string, n: number): string {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Premier jour du mois (AAAA-MM-01) décalé de n mois. */
export function monthStart(isoDay: string, monthsBack = 0): string {
  const [y, m] = isoDay.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 - monthsBack, 1, 12));
  return d.toISOString().slice(0, 10);
}

/** Valeur "datetime-local" → ISO 8601 avec offset Brazzaville. */
export function localInputToIso(value: string): string {
  if (!value) return value;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return `${withSeconds}+01:00`;
}

/** Maintenant, au format attendu par <input type="datetime-local"> à l'heure de Brazzaville. */
export function nowLocalInput(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Montant : jamais « 0 » pour une valeur inconnue.
 * null / vide → « Inconnu » ; devise absente → nombre + « (devise non précisée) ».
 */
export function formatMoney(amount: string | number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return 'Inconnu';
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return 'Inconnu';
  if (!currency) {
    return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(n)} (devise non précisée)`;
  }
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(n);
  } catch {
    return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(n)} ${currency}`;
  }
}

const intFmt = new Intl.NumberFormat(LOCALE);
export function formatNumber(n: number | null | undefined, empty = '—'): string {
  return n === null || n === undefined || Number.isNaN(n) ? empty : intFmt.format(n);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Non calculable';
  return `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} %`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(LOCALE, { maximumFractionDigits: 0 })} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} Mo`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '?';
}

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? '';
}

export function actorName(actor: unknown, empty = '—'): string {
  if (!actor) return empty;
  if (typeof actor === 'string') return actor;
  if (typeof actor === 'object' && actor !== null && 'name' in actor) {
    const n = (actor as { name?: unknown }).name;
    return typeof n === 'string' && n ? n : empty;
  }
  return empty;
}

/** Salutation selon l'heure de Brazzaville. */
export function greeting(now: Date = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now));
  return h >= 18 || h < 4 ? 'Bonsoir' : 'Bonjour';
}

/** Date d'un élément renvoyé par l'API (`date` prioritaire, `created_at` en repli). */
export function itemDate(x: { date?: string | null; created_at?: string | null }): string {
  return x.date ?? x.created_at ?? '';
}

/** Taux avec ses deux termes, jamais seul : « 71 / 128 · 55,5 % » (CHARTE §6.2). */
export function formatRatio(numerator: number | null | undefined, denominator: number | null | undefined, value?: number | null): string {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined) return '—';
  const pct = value ?? (denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null);
  return `${formatNumber(numerator)} / ${formatNumber(denominator)} · ${pct === null ? '—' : formatPercent(pct)}`;
}

/** Durée lisible à partir d'un nombre de secondes (en-tête Retry-After, jusqu'à 24 h) : « 45 s », « 15 min », « 2 h », « 1 h 30 ». */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return 'quelques instants';
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
