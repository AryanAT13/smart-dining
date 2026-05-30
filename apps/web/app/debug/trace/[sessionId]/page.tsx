import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { isDemoMode } from '@smart-dining/core';

import { Button } from '@/components/ui/button';
import { TraceResolver } from '@/components/trace/TraceResolver';

interface PageProps {
  /**
   * The URL slug. Either a session UUID (`b3e8…`) or a humanized table id
   * (`T1`). Humans know table ids; we resolve to UUIDs client-side via the
   * existing `/api/table/:tableId/session` endpoint.
   */
  params: { sessionId: string };
}

export const dynamic = 'force-dynamic';

export default function TracePage({ params }: PageProps) {
  if (!isDemoMode) notFound();

  return (
    <main className="container max-w-3xl space-y-6 py-6 pt-safe">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Debug · Agent Trace
          </p>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
        <h1 className="font-display text-2xl">Agent timeline</h1>
      </header>
      <TraceResolver slug={params.sessionId} />
    </main>
  );
}
