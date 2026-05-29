import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Landing page. In production this is mostly hit by people typing the bare
 * URL — the real entry is QR code → /table/T<n>. We surface a friendly
 * explainer plus a demo link to T1.
 */
export default function HomePage() {
  return (
    <main className="container flex min-h-dvh flex-col items-center justify-center gap-8 py-12 text-center">
      <div className="space-y-3">
        <p className="font-display text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Smart Dining
        </p>
        <h1 className="font-display text-4xl sm:text-5xl">Zaika</h1>
        <p className="mx-auto max-w-md text-balance text-muted-foreground">
          Scan the QR at your table to start ordering. Zara will recommend, group the
          order, and handle the rest.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Demo</p>
        <Button asChild size="lg" className="tap-target">
          <Link href="/table/T1">Open Table 1</Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          (no real QR scan needed — this opens the same flow.)
        </p>
      </div>
    </main>
  );
}
