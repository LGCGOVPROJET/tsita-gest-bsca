import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext, type AuthContextValue } from '@/lib/auth-context';
import { ToastProvider } from '@/components/ui/Toast';
import type { Permission, User } from '@/types/api';

export function makeUser(permissions: Permission[], overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: 'Rachel Démo',
    email: 'responsable@bsca.demo',
    role: 'responsable',
    role_label: 'Responsable de traitement',
    agency: null,
    entity: { id: 2, name: 'Cartes et paiements' },
    mfa_enabled: false,
    permissions,
    ...overrides,
  };
}

export function renderWithProviders(ui: ReactElement, { user = null, route = '/' }: { user?: User | null; route?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const auth: AuthContextValue = {
    user,
    loading: false,
    login: async () => ({ mfa_required: true }),
    logout: async () => undefined,
    refresh: async () => undefined,
  };
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Wrapper }), queryClient: qc };
}
