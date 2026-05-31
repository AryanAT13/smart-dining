'use client';

import { Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useGroupStore } from '@/lib/stores/group';
import { useIdentityStore } from '@/lib/stores/identity';
import { cn } from '@/lib/utils/cn';
import { avatarColour, initialsOf } from '@/lib/utils/format';

/**
 * Always-visible group banner. Even with only one diner at the table it
 * renders — the spec calls for "X people at this table" + avatar row
 * (Flow 4). For the solo case it shows just the current diner's chip.
 *
 * When a NEW joiner appears (participantCount increases), their avatar
 * pulses for ~1.5s so the rest of the table can see who arrived.
 */
export function GroupBanner({ tableId }: { tableId: string }) {
  const members = useGroupStore((s) => s.members);
  const participantCount = useGroupStore((s) => s.participantCount);
  const myName = useIdentityStore((s) => s.displayName);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const previousNames = useRef<Set<string>>(new Set());

  // Detect a new joiner by name (not just count) so we can flash the right chip.
  useEffect(() => {
    const current = new Set(members.map((m) => m.displayName));
    let newcomer: string | null = null;
    for (const name of current) {
      if (!previousNames.current.has(name) && name !== myName) {
        newcomer = name;
        break;
      }
    }
    previousNames.current = current;
    if (newcomer) {
      setHighlighted(newcomer);
      const handle = window.setTimeout(() => setHighlighted(null), 1500);
      return () => window.clearTimeout(handle);
    }
    return;
  }, [members, myName]);

  // Build the display list. If the socket hasn't sent a user_joined event
  // yet, members may be empty even though the current diner is "here" —
  // synthesise the self-entry so the avatar row never looks broken.
  const display = useMemo(() => {
    const base = members.length > 0 ? members : [{ displayName: myName, joinedAt: Date.now() }];
    return [...base].sort((a, b) => {
      if (a.displayName === myName) return -1;
      if (b.displayName === myName) return 1;
      return a.joinedAt - b.joinedAt;
    });
  }, [members, myName]);

  const count = Math.max(participantCount, 1);
  const label = `${count} ${count === 1 ? 'person' : 'people'} at this table · Table ${tableId}`;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/70 px-3 py-2 shadow-sm backdrop-blur"
      aria-label={label}
    >
      <Users className="h-4 w-4 text-primary" />
      <div className="flex -space-x-2">
        {display.slice(0, 5).map((m) => {
          const isMe = m.displayName === myName;
          const isHighlighted = m.displayName === highlighted;
          return (
            <span
              key={m.displayName}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-[10px] font-semibold text-white transition-shadow',
                avatarColour(m.displayName),
                isMe && 'ring-2 ring-primary',
                isHighlighted && 'animate-cart-pop ring-2 ring-spice shadow-lg',
              )}
              title={isMe ? 'You' : m.displayName}
            >
              {initialsOf(m.displayName)}
            </span>
          );
        })}
        {display.length > 5 && (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">
            +{display.length - 5}
          </span>
        )}
      </div>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
