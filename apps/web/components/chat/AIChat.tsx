'use client';

import { MessageCircle, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAIChat } from '@/lib/hooks/useAIChat';
import { useChatStore } from '@/lib/stores/chat';
import { cn } from '@/lib/utils/cn';

import { AgentProgress } from './AgentProgress';
import { MessageBubble } from './MessageBubble';
import { QuickSuggestions } from './QuickSuggestions';

export function AIChat() {
  const isOpen = useChatStore((s) => s.isOpen);
  const setOpen = useChatStore((s) => s.setOpen);
  const messages = useChatStore((s) => s.messages);
  const isAwaiting = useChatStore((s) => s.isAwaitingResponse);
  const agentProgress = useChatStore((s) => s.agentProgress);

  const { send } = useAIChat();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages / streaming tokens.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, agentProgress]);

  const submit = () => {
    const text = draft.trim();
    if (!text || isAwaiting) return;
    void send(text);
    setDraft('');
  };

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      {/* Floating launcher */}
      <Button
        type="button"
        size="lg"
        variant="default"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-4 left-4 z-30 rounded-full shadow-xl pb-safe tap-target',
        )}
        aria-label="Chat with Zara"
      >
        <Sparkles className="h-5 w-5" />
        <span>Ask Zara</span>
      </Button>

      <SheetContent side="bottom" className="flex h-[85dvh] flex-col rounded-t-xl p-0 pb-safe">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Zara
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {messages.length} message{messages.length === 1 ? '' : 's'}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <MessageCircle className="h-8 w-8 opacity-50" />
              <p>
                Tell me what you&apos;re in the mood for — spicy, light, something to share. I&apos;ll
                pick the best things from the menu.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <AgentProgress label={agentProgress} />
        </div>

        <div className="border-t bg-background px-4 pt-3">
          <QuickSuggestions onPick={(q) => void send(q)} disabled={isAwaiting} />
          <form
            className="flex items-center gap-2 pb-3 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              placeholder="thoda spicy chahiye…"
              disabled={isAwaiting}
              className="text-base"
              aria-label="Message Zara"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim() || isAwaiting}
              aria-label="Send"
              className="tap-target shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
