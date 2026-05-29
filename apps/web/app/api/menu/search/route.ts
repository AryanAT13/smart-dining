import { z } from 'zod';

import { menuService } from '@smart-dining/core/services';

import { jsonOk, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  q: z.string().min(1).max(200),
  semantic: z.enum(['true', 'false']).default('false'),
});

export const GET = withErrors(async (req) => {
  const url = req.nextUrl;
  const parsed = QuerySchema.parse({
    q: url.searchParams.get('q') ?? '',
    semantic: (url.searchParams.get('semantic') ?? 'false') as 'true' | 'false',
  });

  if (parsed.semantic === 'true') {
    const matches = await menuService.semanticSearch(parsed.q, { topK: 10 });
    return jsonOk({ matches });
  }
  const items = await menuService.textSearch(parsed.q);
  return jsonOk({ items });
});
