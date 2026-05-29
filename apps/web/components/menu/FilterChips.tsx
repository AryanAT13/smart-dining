'use client';

import { Flame, Leaf, Star, Wheat, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

export type FilterKey = 'veg' | 'spicy' | 'bestseller' | 'gluten-free';

interface FilterChipsProps {
  active: Set<FilterKey>;
  onToggle: (key: FilterKey) => void;
}

const filters: { key: FilterKey; label: string; icon: LucideIcon }[] = [
  { key: 'veg', label: 'Veg', icon: Leaf },
  { key: 'spicy', label: 'Spicy', icon: Flame },
  { key: 'bestseller', label: 'Bestsellers', icon: Star },
  { key: 'gluten-free', label: 'Gluten-free', icon: Wheat },
];

export function FilterChips({ active, onToggle }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map(({ key, label, icon: Icon }) => {
        const on = active.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={on}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors tap-target',
              on
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
