import { useQuery } from '@tanstack/react-query';
import { publicApi, referentialsApi } from '@/api/endpoints';

export function useReferentials(enabled = true) {
  return useQuery({ queryKey: ['referentials'], queryFn: referentialsApi.get, staleTime: 10 * 60_000, enabled });
}

export function usePublicReferentials() {
  return useQuery({ queryKey: ['public-referentials'], queryFn: publicApi.referentials, staleTime: 10 * 60_000 });
}
