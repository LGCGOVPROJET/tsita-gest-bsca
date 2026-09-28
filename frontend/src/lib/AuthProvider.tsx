import { useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/endpoints';
import { ensureCsrf } from '@/api/client';
import type { LoginPayload, User } from '@/types/api';
import { AuthContext, ME_KEY, type AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery<User | null>({
    queryKey: ME_KEY,
    queryFn: authApi.me,
    staleTime: Infinity,
    retry: false,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.data ?? null,
      loading: me.isPending,
      async login(payload: LoginPayload) {
        await ensureCsrf(true);
        const res = await authApi.login(payload);
        if ('data' in res) {
          qc.setQueryData(ME_KEY, res.data);
        }
        return res;
      },
      async logout() {
        try {
          await authApi.logout();
        } finally {
          qc.clear();
          qc.setQueryData(ME_KEY, null);
        }
      },
      async refresh() {
        await qc.invalidateQueries({ queryKey: ME_KEY });
      },
    }),
    [me.data, me.isPending, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
