'use client';

import {
  Flame,
  GlassWater,
  IceCream,
  Leaf,
  Soup,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

interface QuickSuggestionsProps {
  onPick: (text: string) => void;
  disabled?: boolean;
}

/**
 * Spec §5.5 — the full eight intent shortcuts.
 *
 * `query` is what we put into the chat input box on tap. It's natural-language,
 * not a code — the NLU + Router agents pick it up and dispatch exactly as
 * they would a typed message.
 */
const suggestions = [
  { label: 'Spicy',          icon: Flame,      query: 'Something spicy' },
  { label: 'Light',          icon: Leaf,       query: 'Something light, under 400 calories' },
  { label: 'Filling',        icon: Soup,       query: 'A filling main course' },
  { label: 'Dessert',        icon: IceCream,   query: 'Something sweet for dessert' },
  { label: 'Drinks pairing', icon: GlassWater, query: "What drink pairs well with what's in our cart" },
  { label: 'Best sellers',   icon: Star,       query: 'What are the best things to order here' },
  { label: "Chef's special", icon: Sparkles,   query: "What's the chef's special tonight" },
  { label: 'For groups',     icon: Users,      query: "We want crowd-pleasers good for sharing" },
];

export function QuickSuggestions({ onPick, disabled }: QuickSuggestionsProps) {
  return (
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Quick suggestion chips"
    >
      {suggestions.map(({ label, icon: Icon, query }) => (
        <Button
          key={label}
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full border-border/70 bg-card/80 tap-target"
          onClick={() => onPick(query)}
          disabled={disabled}
        >
          <Icon className="h-3.5 w-3.5 text-primary" />
          {label}
        </Button>
      ))}
    </div>
  );
}
