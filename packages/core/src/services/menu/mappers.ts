import type { MenuItem } from '@prisma/client';

import type { MenuItemView } from './types.js';

export function toMenuItemView(row: MenuItem): MenuItemView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    // Prisma's Decimal toNumber() loses precision past 15 digits — irrelevant
    // for prices in INR but worth knowing if we ever bill in higher units.
    price: row.price.toNumber(),
    description: row.description,
    imageUrl: row.imageUrl,
    tags: row.tags,
    allergens: row.allergens,
    available: row.available,
    popularScore: row.popularScore,
    caloriesKcal: row.caloriesKcal,
    prepTimeMinutes: row.prepTimeMinutes,
  };
}
