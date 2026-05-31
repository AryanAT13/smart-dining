'use client';

import { Loader2, Sparkles } from 'lucide-react';

import { CartStepper } from '@/components/cart/CartStepper';
import { FoodImage } from '@/components/menu/FoodImage';
import { useCartUiStore } from '@/lib/stores/cartUi';
import type { ChatMessage } from '@/lib/stores/chat';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/format';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.sender === 'user';
  const flashAdd = useCartUiStore((s) => s.flashAdd);

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={cn('max-w-[85%] space-y-2', isUser && 'flex flex-col items-end')}>
        {(message.text || (message.isStreaming && (!message.suggestions || message.suggestions.length === 0))) && (
          <div
            className={cn(
              'rounded-2xl px-3.5 py-2 text-sm leading-snug',
              isUser
                ? 'rounded-br-md bg-primary text-primary-foreground'
                : 'rounded-bl-md bg-accent/50 text-accent-foreground',
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
        )}

        {message.suggestions && message.suggestions.length > 0 && (
          <div className="space-y-2">
            {message.suggestions.map((s) => (
              <div
                key={s.itemId}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/95 p-2 shadow-sm backdrop-blur"
              >
                <FoodImage
                  src={s.imageUrl}
                  name={s.name}
                  className="h-12 w-12 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{s.reason}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatINR(s.price)}
                </span>
                <CartStepper
                  menuItemId={s.itemId}
                  compact
                  showAddLabel={false}
                  lineSelector="mine"
                  onAfterAdd={flashAdd}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
