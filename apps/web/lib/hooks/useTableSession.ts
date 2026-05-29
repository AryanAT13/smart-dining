/**
 * `useTableSession` — resolves (or creates) the session for the current table,
 * persists tableId+sessionId into the identity store, and exposes the result.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { fetchSessionForTable, sessionKeys } from '@/lib/api/fetchers';
import { useIdentityStore } from '@/lib/stores/identity';

export function useTableSession(tableId: string) {
  const setTable = useIdentityStore((s) => s.setTable);

  const query = useQuery({
    queryKey: sessionKeys.forTable(tableId),
    queryFn: () => fetchSessionForTable(tableId),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data?.session) {
      setTable(query.data.session.tableId, query.data.session.id);
    }
  }, [query.data, setTable]);

  return query;
}
