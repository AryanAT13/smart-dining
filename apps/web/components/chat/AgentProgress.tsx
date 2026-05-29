'use client';

import { Sparkles } from 'lucide-react';

export function AgentProgress({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground animate-slide-up-fade">
      <Sparkles className="h-3 w-3 animate-pulse" />
      <span>{label}</span>
    </div>
  );
}
