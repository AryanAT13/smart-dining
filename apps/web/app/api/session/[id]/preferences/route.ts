/**
 * Persist a partial preferences patch onto a session.
 *
 * Called by the micro-onboarding UI and by the chat path when the
 * Context Memory agent surfaces an inferred preference. Uses the same
 * `sessionService.updatePreferences` (merge-not-replace) as the agent
 * tool, so behaviour is consistent across surfaces.
 */

import { z } from 'zod';

import { sessionService } from '@smart-dining/core/services';
import { UserPreferencesSchema } from '@smart-dining/shared';

import { jsonOk, parseBody, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ preferences: UserPreferencesSchema });

export const POST = withErrors<{ id: string }>(async (req, { params }) => {
  const { id } = ParamsSchema.parse(params);
  const body = await parseBody(req, BodySchema);
  const session = await sessionService.updatePreferences(id, body.preferences);
  return jsonOk({
    preferences: session.preferences,
    language: session.language,
  });
});
