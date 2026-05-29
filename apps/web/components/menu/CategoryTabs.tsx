'use client';

import { cn } from '@/lib/utils/cn';
import { categoryLabel } from '@/lib/utils/format';

interface CategoryTabsProps {
  categories: string[];
  active: string | 'all';
  onChange: (category: string | 'all') => void;
}

export function CategoryTabs({ categories, active, onChange }: CategoryTabsProps) {
  return (
    <nav
      aria-label="Menu categories"
      className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        onClick={() => onChange('all')}
        className={cn(
          'shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors tap-target',
          active === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground hover:bg-accent',
        )}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors tap-target',
            active === c
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-accent',
          )}
        >
          {categoryLabel(c)}
        </button>
      ))}
    </nav>
  );
}
