import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ToastContext, type ToastApi, type ToastItem, type ToastTone } from './toast-context';

const ICONS = { info: Info, success: CheckCircle2, error: XCircle, warn: AlertTriangle };

/** Toasts annoncés via aria-live (polite ; assertive pour les erreurs). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = ++seq.current;
      setItems((l) => {
        // Évite les doublons identiques empilés (ex. plusieurs 429 simultanés).
        if (l.some((t) => t.message === message)) return l;
        return [...l.slice(-3), { id, message, tone }];
      });
      window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 5000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      warn: (m) => show(m, 'warn'),
    }),
    [show],
  );

  const polite = items.filter((t) => t.tone !== 'error');
  const assertive = items.filter((t) => t.tone === 'error');

  const render = (t: ToastItem) => {
    const Icon = ICONS[t.tone];
    return (
      <div key={t.id} className={`toast ${t.tone}`}>
        <Icon size={17} aria-hidden="true" />
        <span>{t.message}</span>
        <button type="button" onClick={() => dismiss(t.id)} aria-label="Fermer la notification">
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    );
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region">
        <div role="status" aria-live="polite" aria-atomic="false" style={{ display: 'grid', gap: 10 }}>
          {polite.map(render)}
        </div>
        <div role="alert" aria-live="assertive" style={{ display: 'grid', gap: 10 }}>
          {assertive.map(render)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
