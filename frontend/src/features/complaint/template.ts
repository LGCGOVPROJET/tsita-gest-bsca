import { formatDate } from '@/lib/format';
import type { ComplaintDetail } from '@/types/api';

/** Remplit les champs dynamiques d'un modèle de réponse (texte brut). */
export function fillTemplate(body: string, c: Pick<ComplaintDetail, 'reference' | 'customer' | 'customer_name' | 'deadlines' | 'due_at'>): string {
  const finalDue = c.deadlines?.find((d) => d.kind === 'reponse_finale')?.due_at ?? c.due_at;
  return body
    .replaceAll('{{reference}}', c.reference)
    .replaceAll('{{client}}', c.customer?.full_name ?? c.customer_name)
    .replaceAll('{{date_limite}}', formatDate(finalDue));
}
