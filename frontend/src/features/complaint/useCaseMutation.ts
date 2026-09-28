import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toApiError, type ApiError } from '@/api/client';
import { useToast } from '@/components/ui/toast-context';

/** Mutation sur un dossier : rafraîchit le détail et les listes, toast de succès, erreur normalisée. */
export function useCaseMutation<V>(complaintId: number, fn: (v: V) => Promise<unknown>, successMessage: string | ((r: unknown) => string)) {
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation<unknown, unknown, V>({
    mutationFn: fn,
    onSuccess: async (r) => {
      toast.success(typeof successMessage === 'function' ? successMessage(r) : successMessage);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['complaint', String(complaintId)] }),
        qc.invalidateQueries({ queryKey: ['complaints'] }),
        qc.invalidateQueries({ queryKey: ['solutions'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['deadlines'] }),
      ]);
    },
  });
  const error: ApiError | null = m.isError ? toApiError(m.error) : null;
  return { ...m, apiError: error };
}
