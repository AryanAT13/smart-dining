'use client';

import {
  Flame,
  IceCream,
  Leaf,
  Shuffle,
  Soup,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils/cn';

export type VibeKey = 'spicy' | 'light' | 'sweet' | 'filling' | 'surprise';

interface VibeOption {
  key: VibeKey;
  label: string;
  icon: LucideIcon;
}

const VIBES: VibeOption[] = [
  { key: 'spicy', label: 'Spicy', icon: Flame },
  { key: 'light', label: 'Light', icon: Leaf },
  { key: 'sweet', label: 'Sweet', icon: IceCream },
  { key: 'filling', label: 'Filling', icon: Soup },
  { key: 'surprise', label: 'Surprise me', icon: Shuffle },
];

interface VibeChipsProps {
  selected: Set<VibeKey>;
  onChange: (next: Set<VibeKey>) => void;
}

export function VibeChips({ selected, onChange }: VibeChipsProps) {
  const toggle = (key: VibeKey) => {
    const next = new Set(selected);
    // "Surprise me" is exclusive — picking it clears the others, and
    // picking anything else clears "Surprise me".
    if (key === 'surprise') {
      if (next.has('surprise')) next.delete('surprise');
      else {
        next.clear();
        next.add('surprise');
      }
    } else {
      next.delete('surprise');
      if (next.has(key)) next.delete(key);
      else next.add(key);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {VIBES.map(({ key, label, icon: Icon }) => {
        const on = selected.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            aria-pressed={on}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors tap-target',
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-accent',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export type AllergenKey = 'dairy' | 'gluten' | 'nuts' | 'fish' | 'shellfish' | 'soy' | 'egg';

interface AllergenChipsProps {
  selected: Set<AllergenKey>;
  onChange: (next: Set<AllergenKey>) => void;
}

const ALLERGENS: { key: AllergenKey; label: string }[] = [
  { key: 'dairy', label: 'Dairy' },
  { key: 'gluten', label: 'Gluten' },
  { key: 'nuts', label: 'Nuts' },
  { key: 'shellfish', label: 'Shellfish' },
  { key: 'fish', label: 'Fish' },
  { key: 'soy', label: 'Soy' },
  { key: 'egg', label: 'Egg' },
];

export function AllergenChips({ selected, onChange }: AllergenChipsProps) {
  const toggle = (key: AllergenKey) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {ALLERGENS.map(({ key, label }) => {
        const on = selected.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            aria-pressed={on}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors tap-target',
              on
                ? 'border-destructive bg-destructive/10 text-destructive'
                : 'border-border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {on ? '✗ ' : ''}
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Translate the chip selection into the canonical `UserPreferences` shape
 * the session expects. `surprise` is a UI-only flag that intentionally
 * persists nothing — it's how a user opts OUT of preference seeding.
 */
export function vibesToPreferences(
  vibes: Set<VibeKey>,
  allergens: Set<AllergenKey>,
): Record<string, unknown> {
  if (vibes.has('surprise') && allergens.size === 0) return {};
  const prefs: Record<string, unknown> = {};
  if (vibes.has('spicy')) prefs['spicy'] = true;
  if (vibes.has('light')) prefs['light'] = true;
  if (vibes.has('sweet')) prefs['sweet'] = true;
  if (vibes.has('filling')) prefs['filling'] = true;
  if (allergens.size > 0) prefs['excludeAllergens'] = Array.from(allergens);
  return prefs;
}
