'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchMenu, fetchPopular, menuKeys } from '@/lib/api/fetchers';

export function useMenu() {
  return useQuery({
    queryKey: menuKeys.list(),
    queryFn: fetchMenu,
    staleTime: 60_000,
  });
}

export function usePopular(limit = 5) {
  return useQuery({
    queryKey: menuKeys.popular(limit),
    queryFn: () => fetchPopular(limit),
    staleTime: 60_000,
  });
}
