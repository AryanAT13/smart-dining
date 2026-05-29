import { z } from 'zod';

import { orderService } from '@smart-dining/core/services';

import { jsonOk, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const GET = withErrors<{ id: string }>(async (_req, { params }) => {
  const { id } = ParamsSchema.parse(params);
  const order = await orderService.getById(id);
  return jsonOk({ order });
});
