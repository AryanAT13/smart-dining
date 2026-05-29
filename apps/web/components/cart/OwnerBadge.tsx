import { cn } from '@/lib/utils/cn';
import { avatarColour, initialsOf } from '@/lib/utils/format';

interface OwnerBadgeProps {
  name: string;
  isYou?: boolean;
}

export function OwnerBadge({ name, isYou }: OwnerBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground',
      )}
      title={isYou ? 'Added by you' : `Added by ${name}`}
    >
      <span
        className={cn(
          'inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white',
          avatarColour(name),
        )}
      >
        {initialsOf(name)}
      </span>
      {isYou ? 'You' : name}
    </span>
  );
}
