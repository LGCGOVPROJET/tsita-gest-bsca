import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

/**
 * Client HTTP unique. Authentification Sanctum SPA par cookie httpOnly :
 * aucun jeton n'est stocké côté navigateur (ni localStorage, ni sessionStorage).
 */
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  timeout: 60_000,
});

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Ne pas déclencher la redirection globale vers la connexion sur 401. */
    skipAuthRedirect?: boolean;
    /** Ne pas afficher de toast global pour 429 / 5xx. */
    silent?: boolean;
    _csrfRetried?: boolean;
  }
}

// ——— Événements globaux (écoutés par ApiEventsBridge) ———
export type ApiEventType =
  | 'unauthorized'
  | 'rate-limited'
  | 'server-error'
  | 'forbidden'
  | 'network-error'
  /** 403 { mfa_enrollment_required: true } : la MFA est obligatoire pour ce profil (écran d'enrôlement). */
  | 'mfa-enrollment-required';
export const apiEvents = new EventTarget();

function emit(type: ApiEventType, detail?: unknown) {
  apiEvents.dispatchEvent(new CustomEvent(type, { detail }));
}

// ——— CSRF Sanctum ———
let csrfPromise: Promise<void> | null = null;

export function ensureCsrf(force = false): Promise<void> {
  if (force || !csrfPromise) {
    csrfPromise = axios
      .get('/sanctum/csrf-cookie', { withCredentials: true, headers: { Accept: 'application/json' } })
      .then(() => undefined)
      .catch((e: unknown) => {
        csrfPromise = null;
        throw e;
      });
  }
  return csrfPromise;
}

const MUTATING = new Set(['post', 'put', 'patch', 'delete']);

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (MUTATING.has((config.method ?? 'get').toLowerCase())) {
    await ensureCsrf();
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const config = error.config as (AxiosRequestConfig & InternalAxiosRequestConfig) | undefined;
    const status = error.response?.status;

    // 419 : jeton CSRF expiré → on le renouvelle puis on rejoue une fois.
    if (status === 419 && config && !config._csrfRetried) {
      config._csrfRetried = true;
      await ensureCsrf(true);
      return api.request(config);
    }

    if (status === 401 && !config?.skipAuthRedirect) {
      emit('unauthorized');
    } else if (status === 429 && !config?.silent) {
      emit('rate-limited', { retryAfter: retryAfterSeconds(error) });
    } else if (status === 403 && isMfaEnrollmentRequired(error)) {
      // Pas de toast « accès refusé » : l'application doit rediriger vers l'enrôlement MFA.
      emit('mfa-enrollment-required');
    } else if (status === 403 && !config?.silent) {
      emit('forbidden', { message: messageOf(error) });
    } else if (status !== undefined && status >= 500 && !config?.silent) {
      emit('server-error', { status });
    } else if (!error.response && !axios.isCancel(error) && !config?.silent) {
      emit('network-error');
    }
    return Promise.reject(error);
  },
);

// ——— Normalisation des erreurs ———
export interface ApiError {
  status: number | null;
  message: string;
  fieldErrors: Record<string, string>;
  retryAfter: number | null;
}

/** Le serveur impose la MFA au profil et elle n'est pas encore configurée (docs/SECURITE.md, SEC-01). */
export function isMfaEnrollmentRequired(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) return false;
  const data = error.response.data as { mfa_enrollment_required?: unknown } | undefined;
  return data?.mfa_enrollment_required === true;
}

function messageOf(error: AxiosError): string | undefined {
  const data = error.response?.data as { message?: unknown } | undefined;
  return typeof data?.message === 'string' ? data.message : undefined;
}

export function retryAfterSeconds(error: AxiosError): number | null {
  const h = error.response?.headers?.['retry-after'];
  const n = Number(Array.isArray(h) ? h[0] : h);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DEFAULT_MESSAGES: Record<number, string> = {
  401: "Votre session a expiré après 30 minutes d'inactivité. Reconnectez-vous pour continuer.",
  403: "Vous n'avez pas accès à cet élément : il dépend d'un autre périmètre. Contactez son responsable si besoin.",
  404: "Cet élément est introuvable. Il a peut-être été déplacé, ou l'adresse est incorrecte.",
  413: 'Ce fichier dépasse 10 Mo. Réduisez-le ou envoyez-le en plusieurs parties (PDF, JPG ou PNG).',
  419: 'Session de sécurité expirée. Réessayez.',
  422: 'Certaines informations sont incomplètes ou invalides : corrigez les champs signalés.',
  423: 'Compte temporairement verrouillé après plusieurs échecs. Réessayez dans 15 minutes.',
  429: 'Trop de tentatives. Patientez avant de réessayer.',
};

export function toApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? null;
    const data = err.response?.data as { message?: string; errors?: Record<string, string[] | string> } | undefined;
    const fieldErrors: Record<string, string> = {};
    if (data?.errors && typeof data.errors === 'object') {
      for (const [k, v] of Object.entries(data.errors)) {
        const first = Array.isArray(v) ? v[0] : v;
        if (typeof first === 'string') fieldErrors[k] = first;
      }
    }
    let message = typeof data?.message === 'string' && data.message ? data.message : '';
    if (!message || (status !== null && status >= 500)) {
      message =
        (status !== null && DEFAULT_MESSAGES[status]) ||
        (status === null
          ? 'Le service ne répond pas pour le moment. Vérifiez votre connexion ; vos saisies ne sont pas perdues.'
          : 'Le service ne répond pas pour le moment. Vos modifications ne sont pas perdues : réessayez dans quelques instants.');
    }
    return { status, message, fieldErrors, retryAfter: retryAfterSeconds(err) };
  }
  return {
    status: null,
    message: err instanceof Error ? err.message : 'Une erreur inattendue est survenue.',
    fieldErrors: {},
    retryAfter: null,
  };
}

/** Nettoie les paramètres vides avant envoi. */
export function cleanParams<T extends object>(params: T): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v as string | number;
  }
  return out;
}

/** Télécharge un flux binaire (exports, pièces) en conservant le nom fourni par le serveur. */
export async function downloadFile(url: string, params: object, fallbackName: string): Promise<void> {
  const res = await api.get<Blob>(url, { params: cleanParams(params), responseType: 'blob' });
  const dispo = String(res.headers['content-disposition'] ?? '');
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(dispo);
  const name = match?.[1] ? decodeURIComponent(match[1]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
