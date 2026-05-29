import { otpService } from '@smart-dining/core/services';
import { VerifyOtpRequestSchema } from '@smart-dining/shared';

import { jsonOk, parseBody, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const POST = withErrors(async (req) => {
  const body = await parseBody(req, VerifyOtpRequestSchema);
  const verified = await otpService.verify(body.phone, body.code);
  return jsonOk({ token: verified.token, expiresAt: verified.expiresAt });
});
