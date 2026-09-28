import { QueryClient } from '@tanstack/react-query';
import axios from 'axios';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => {
          const status = axios.isAxiosError(error) ? error.response?.status : undefined;
          if (status && status >= 400 && status < 500) return false;
          return count < 1;
        },
      },
      mutations: { retry: false },
    },
  });
}
