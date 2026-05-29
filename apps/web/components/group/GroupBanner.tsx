'use client';

import { Users } from 'lucide-react';

import { useGroupStore } from '@/lib/stores/group';
import { useIdentityStore } from '@/lib/stores/identity';
import { cn } from '@/lib/utils/cn';
import { avatarColour, initialsOf } from '@/lib/utils/format';

export function GroupBanner({ tableId }: { tableId: string }) {
  const members = useGroupStore((s) => s.members);
  const participantCount = useGroupStore((s) => s.participantCount);
  const myName = useIdentityStore((s) => s.displayName);

  if (participantCount === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Table {tableId}
      </div>
    );
  }

  // Sort with "You" first.
  const sorted = [...members].sort((a, b) => {
    if (a.displayName === myName) return -1;
    if (b.displayName === myName) return 1;
    return a.joinedAt - b.joinedAt;
  });

  return (
    <div className="flex items-center gap-3 rounded-lg bg-accent/40 px-3 py-2">
      <Users className="h-4 w-4 text-accent-foreground" />
      <div className="flex -space-x-2">
        {sorted.slice(0, 5).map((m) => {
          const isMe = m.displayName === myName;
          return (
            <span
              key={m.displayName}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold text-white',
                avatarColour(m.displayName),
                isMe && 'ring-2 ring-primary',
              )}
              title={isMe ? 'You' : m.displayName}
            >
              {initialsOf(m.displayName)}
            </span>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        {participantCount} {participantCount === 1 ? 'diner' : 'diners'} · Table {tableId}
      </span>
    </div>
  );
}
