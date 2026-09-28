import type { StepDef } from '@/components/ui/Stepper';
import type { ClientComplaintView as View } from '@/types/api';

/** Correspondance statut client (§6) → étape du parcours visuel. */
export function clientStepIndex(v: Pick<View, 'client_status' | 'client_status_label'>): { steps: StepDef[]; current: number } {
  const label = (v.client_status_label || '').toLowerCase();
  const code = String(v.client_status || '').toLowerCase();
  const infoRequested = code.includes('information') || label.includes('information');
  const steps: StepDef[] = [
    { key: 'recue', label: 'Reçue' },
    { key: 'analyse', label: infoRequested ? 'Information demandée' : "En cours d'analyse", alert: infoRequested },
    { key: 'reponse', label: 'Réponse envoyée' },
    { key: 'cloturee', label: 'Clôturée' },
  ];
  let current = 0;
  if (code.includes('clotur') || label.includes('clôtur')) current = 3;
  else if (code.includes('reponse') || label.includes('réponse')) current = 2;
  else if (infoRequested || code.includes('cours') || code.includes('analyse') || label.includes('analyse') || code.includes('reouver') || label.includes('réouvert')) current = 1;
  return { steps, current };
}

export function statusTone(v: Pick<View, 'client_status' | 'client_status_label'>): 'success' | 'warn' | 'info' {
  const { current, steps } = clientStepIndex(v);
  if (current >= 2) return 'success';
  if (steps[1]?.alert) return 'warn';
  return 'info';
}
