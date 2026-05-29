'use client';

import { Loader2, Plus, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAddCartItem } from '@/lib/hooks/useCart';
import type { ChatMessage } from '@/lib/stores/chat';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/format';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.sender === 'user';
  const add = useAddCartItem();

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={cn('max-w-[85%] space-y-2', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-secondary text-secondary-foreground rounded-bl-sm',
          )}
        >
          {message.text ||
            (message.isStreaming && (
              <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
            ))}
          {message.text && message.isStreaming && (
            <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle" />
          )}
        </div>

        {message.suggestions && message.suggestions.length > 0 && (
          <div className="space-y-2">
            {message.suggestions.map((s) => (
              <div
                key={s.itemId}
                className="flex items-center gap-3 rounded-lg border bg-card p-2 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{s.reason}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatINR(s.price)}
                </span>
                <Button
                  size="sm"
                  type="button"
                  className="shrink-0 tap-target"
                  onClick={() => add.mutate({ menuItemId: s.itemId })}
                  disabled={add.isPending}
                  aria-label={`Add ${s.name}`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
