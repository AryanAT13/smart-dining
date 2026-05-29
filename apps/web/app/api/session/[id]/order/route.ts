import { z } from 'zod';

import { orderService } from '@smart-dining/core/services';
import { PlaceOrderRequestSchema } from '@smart-dining/shared';

import { jsonOk, parseBody, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

export const POST = withErrors<{ id: string }>(async (req, { params }) => {
  const { id } = ParamsSchema.parse(params);
  const body = await parseBody(req, PlaceOrderRequestSchema);
  const order = await orderService.place({
    sessionId: id,
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    otpToken: body.otpToken,
  });
  return jsonOk({ order }, { status: 201 });
});
