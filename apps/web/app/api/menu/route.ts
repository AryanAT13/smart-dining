import { z } from 'zod';

import { menuService, type MenuItemView } from '@smart-dining/core/services';

import { jsonOk, withErrors } from '@/lib/server/route';

type MenuCategory = MenuItemView['category'];

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const QuerySchema = z.object({
  category: z.string().optional(),
  excludeAllergens: z.string().optional(),
});

export const GET = withErrors(async (req) => {
  const url = req.nextUrl;
  const parsed = QuerySchema.parse({
    category: url.searchParams.get('category') ?? undefined,
    excludeAllergens: url.searchParams.get('excludeAllergens') ?? undefined,
  });

  const categories = parsed.category
    ? (parsed.category.split(',').map((s) => s.trim()) as MenuCategory[])
    : undefined;
  const excludeAllergens = parsed.excludeAllergens
    ? parsed.excludeAllergens.split(',').map((s) => s.trim())
    : undefined;

  const items = await menuService.list({
    ...(categories ? { categories } : {}),
    ...(excludeAllergens ? { excludeAllergens } : {}),
  });
  return jsonOk({ items });
});
