/**
 * MenuService DTOs and filter shapes.
 *
 * Kept in a sibling module so tools/, agents/, and route handlers can import
 * the types without pulling in the service implementation (and its Prisma
 * dependency) at type-check time.
 */

import type { MenuCategory } from '@prisma/client';

export interface MenuItemView {
  id: string;
  slug: string;
  name: string;
  category: MenuCategory;
  price: number;
  description: string;
  imageUrl: string;
  tags: string[];
  allergens: string[];
  available: boolean;
  popularScore: number;
  caloriesKcal: number | null;
  prepTimeMinutes: number | null;
}

export interface MenuFilters {
  /** Limit to these categories. */
  categories?: MenuCategory[];
  /** Drop items whose `allergens` intersect this set. */
  excludeAllergens?: string[];
  /** Soft tag match — items with at least one of these tags rank higher. */
  preferTags?: string[];
  /** Hard tag match — items must include ALL of these tags. */
  requireTags?: string[];
  /** Drop unavailable items (default true). */
  availableOnly?: boolean;
  /** Drop items already in this set (used for "don't recommend what's in the cart"). */
  excludeIds?: string[];
  /** Max calories for "light" filtering. */
  maxCaloriesKcal?: number;
}

export interface SemanticSearchOptions extends MenuFilters {
  topK?: number;
}

export interface SemanticMatch {
  item: MenuItemView;
  /** Cosine *similarity*, not distance — higher is better, [0, 1]. */
  similarity: number;
}

export interface ComplementarySuggestion {
  item: MenuItemView;
  weight: number;
}
