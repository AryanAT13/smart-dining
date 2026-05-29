import { otpService } from '@smart-dining/core/services';
import { SendOtpRequestSchema } from '@smart-dining/shared';

import { jsonOk, parseBody, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const POST = withErrors(async (req) => {
  const body = await parseBody(req, SendOtpRequestSchema);
  const result = await otpService.send(body.phone);
  // debugCode only present in dev/mock — we relay it for the demo UX.
  return jsonOk({
    expiresAt: result.expiresAt,
    ...(result.debugCode ? { debugCode: result.debugCode } : {}),
  });
});
