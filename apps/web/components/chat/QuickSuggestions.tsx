'use client';

import { Flame, Leaf, Soup, Star, Sparkles, IceCream } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface QuickSuggestionsProps {
  onPick: (text: string) => void;
  disabled?: boolean;
}

const suggestions = [
  { label: 'Spicy', icon: Flame, query: 'Something spicy' },
  { label: 'Light', icon: Leaf, query: 'Something light, under 400 calories' },
  { label: 'Filling', icon: Soup, query: 'A filling main course' },
  { label: 'Dessert', icon: IceCream, query: 'Something sweet for dessert' },
  { label: 'Bestsellers', icon: Star, query: 'What are the best things to order here' },
  { label: "Chef's pick", icon: Sparkles, query: "What's the chef's special" },
];

export function QuickSuggestions({ onPick, disabled }: QuickSuggestionsProps) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {suggestions.map(({ label, icon: Icon, query }) => (
        <Button
          key={label}
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full tap-target"
          onClick={() => onPick(query)}
          disabled={disabled}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </Button>
      ))}
    </div>
  );
}
