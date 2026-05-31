'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils/cn';

interface FoodImageProps {
  /** Real image URL (R2 CDN in prod). Optional — placeholder renders if missing or broken. */
  src?: string | null | undefined;
  /** Item name; surfaces as alt text and as the placeholder's monogram. */
  name: string;
  /** Menu category — chooses the emoji + colourway for the placeholder. */
  category?: string | undefined;
  className?: string | undefined;
  /** Rounded variant for tiny chat suggestions. */
  rounded?: 'lg' | 'xl' | 'full' | undefined;
}

/**
 * Resilient food image. Tries the real CDN URL first; on any error
 * (404, broken, blocked) falls back to a deterministic gradient
 * placeholder with a food emoji + the item's initial.
 *
 * Why not next/image: Next's image optimiser refuses to load arbitrary
 * external hosts without the explicit allowlist (already configured for
 * r2.dev and *.smart-dining.app). The dev/demo URLs in seed data hit
 * `http://localhost:3000/menu-images/<slug>.webp` which 404s — without
 * this fallback the menu looked broken. The plain `<img>` with onError
 * gives us the graceful degrade.
 */
export function FoodImage({
  src,
  name,
  category,
  className,
  rounded = 'lg',
}: FoodImageProps) {
  const [failed, setFailed] = useState(false);
  const usePlaceholder = !src || failed;

  const { emoji, fromColour, toColour } = useMemo(
    () => paletteFor(category, name),
    [category, name],
  );

  const radius =
    rounded === 'full' ? 'rounded-full' : rounded === 'xl' ? 'rounded-xl' : 'rounded-lg';

  if (usePlaceholder) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden',
          radius,
          className,
        )}
        style={{
          backgroundImage: `linear-gradient(135deg, ${fromColour} 0%, ${toColour} 100%)`,
        }}
        aria-label={name}
        role="img"
      >
        <span
          className="select-none text-3xl drop-shadow-sm sm:text-4xl"
          aria-hidden
        >
          {emoji}
        </span>
        <span className="absolute bottom-1 right-1.5 select-none text-[10px] font-bold uppercase tracking-wider text-white/80">
          {name.slice(0, 2)}
        </span>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('object-cover', radius, className)}
    />
  );
}

/**
 * Deterministic colour + emoji per category. Falls back to a hash of the
 * name for unknown categories so two items never collide on the same
 * default surface.
 */
function paletteFor(
  category: string | undefined,
  name: string,
): { emoji: string; fromColour: string; toColour: string } {
  const byCategory: Record<string, { emoji: string; from: string; to: string }> = {
    veg_starters:     { emoji: '🥬', from: '#fef3c7', to: '#86efac' },
    non_veg_starters: { emoji: '🍢', from: '#fde68a', to: '#fb923c' },
    mains_veg:        { emoji: '🥘', from: '#fde68a', to: '#a3e635' },
    mains_non_veg:    { emoji: '🍛', from: '#fed7aa', to: '#f97316' },
    breads_rice:      { emoji: '🫓', from: '#fef3c7', to: '#fbbf24' },
    desserts:         { emoji: '🍮', from: '#fce7f3', to: '#fb923c' },
    beverages_hot:    { emoji: '☕', from: '#fef3c7', to: '#d97706' },
    beverages_cold:   { emoji: '🥤', from: '#dbeafe', to: '#0ea5e9' },
    combos_deals:     { emoji: '🍽️', from: '#fef3c7', to: '#dd4f1e' },
  };

  const match = category ? byCategory[category] : undefined;
  if (match) return { emoji: match.emoji, fromColour: match.from, toColour: match.to };

  // Hash-derived fallback for unknown categories.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const fallbacks = [
    { emoji: '🍴', from: '#fde68a', to: '#fb923c' },
    { emoji: '🍲', from: '#fed7aa', to: '#f97316' },
    { emoji: '🥗', from: '#bbf7d0', to: '#22c55e' },
  ];
  const pick = fallbacks[Math.abs(hash) % fallbacks.length] ?? fallbacks[0]!;
  return { emoji: pick.emoji, fromColour: pick.from, toColour: pick.to };
}
