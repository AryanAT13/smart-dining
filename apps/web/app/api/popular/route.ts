import { z } from 'zod';

import { menuService } from '@smart-dining/core/services';

import { jsonOk, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const GET = withErrors(async (req) => {
  const parsed = QuerySchema.parse({
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
  });
  const items = await menuService.getPopular(parsed.limit);
  return jsonOk({ items });
});
