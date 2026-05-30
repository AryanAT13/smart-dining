'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';

import { fetchSessionForTable, sessionKeys } from '@/lib/api/fetchers';

import { TraceTimeline } from './TraceTimeline';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TraceResolverProps {
  /** URL slug — either a session UUID or a table id like `T1`. */
  slug: string;
}

/**
 * Resolves the URL slug to a session UUID. If the slug is already a UUID,
 * skip the lookup; otherwise treat it as a tableId and fetch the active
 * session for that table.
 *
 * This is what makes `/debug/trace/T1` (typed by a human) work the same as
 * `/debug/trace/<uuid>` (linked from elsewhere in the app).
 */
export function TraceResolver({ slug }: TraceResolverProps) {
  const isUuid = UUID_RE.test(slug);

  // Skip the fetch entirely when slug is already a UUID. The query stays
  // disabled in that branch but TanStack Query still needs to be called
  // unconditionally to satisfy the hook rules.
  const query = useQuery({
    queryKey: sessionKeys.forTable(slug),
    queryFn: () => fetchSessionForTable(slug),
    enabled: !isUuid,
    staleTime: 60_000,
    retry: 0,
  });

  if (isUuid) {
    return (
      <>
        <SubtitleSession sessionId={slug} tableId={null} />
        <TraceTimeline sessionId={slug} />
      </>
    );
  }

  if (query.isLoading) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Resolving session for table <code className="font-mono">{slug}</code>…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive">
        <AlertCircle className="mx-auto mb-2 h-5 w-5" />
        Couldn&apos;t find an active session for table{' '}
        <code className="font-mono">{slug}</code>. Visit{' '}
        <code className="font-mono">/table/{slug}</code> first to start one.
      </div>
    );
  }

  return (
    <>
      <SubtitleSession sessionId={query.data.session.id} tableId={slug.toUpperCase()} />
      <TraceTimeline sessionId={query.data.session.id} />
    </>
  );
}

function SubtitleSession({ sessionId, tableId }: { sessionId: string; tableId: string | null }) {
  return (
    <p className="text-sm text-muted-foreground">
      {tableId ? (
        <>
          Table <code className="font-mono text-xs">{tableId}</code> · session{' '}
        </>
      ) : (
        <>Session </>
      )}
      <code className="font-mono text-xs">{sessionId.slice(0, 8)}…{sessionId.slice(-4)}</code>
    </p>
  );
}
