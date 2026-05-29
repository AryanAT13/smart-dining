import { Suspense } from 'react';

import { TableShell } from './TableShell';

interface PageProps {
  params: { tableId: string };
}

export default function TablePage({ params }: PageProps) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <TableShell tableId={params.tableId} />
    </Suspense>
  );
}

function TableSkeleton() {
  return (
    <div className="container max-w-2xl space-y-4 py-6">
      <div className="h-6 w-32 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    </div>
  );
}
