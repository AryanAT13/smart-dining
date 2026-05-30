'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils/cn';

interface JsonInspectorProps {
  value: unknown;
  className?: string;
  maxPreviewChars?: number;
}

export function JsonInspector({ value, className, maxPreviewChars = 240 }: JsonInspectorProps) {
  const [expanded, setExpanded] = useState(false);
  const pretty = (() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  })();

  const showToggle = pretty.length > maxPreviewChars;
  const display = expanded || !showToggle ? pretty : pretty.slice(0, maxPreviewChars) + '…';

  return (
    <div className={cn('space-y-1', className)}>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-2 font-mono text-[10.5px] leading-snug text-foreground">
        {display}
      </pre>
      {showToggle && (
        <button
          type="button"
          className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Collapse' : 'Show all'}
        </button>
      )}
    </div>
  );
}
