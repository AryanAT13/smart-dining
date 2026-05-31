/**
 * Persist a partial preferences patch onto a session.
 *
 * Called by the micro-onboarding UI and by the chat path when the
 * Context Memory agent surfaces an inferred preference. Uses the same
 * `sessionService.updatePreferences` (merge-not-replace) as the agent
 * tool, so behaviour is consistent across surfaces.
 *
 * Cache-bust: invalidate the AI Picks Redis cache so the next /ai/picks
 * call recomputes against the new preferences. Without this, the user
 * picks chips during onboarding but sees the stale prefs-free picks for
 * up to 30 seconds — which looks like the chips were ignored.
 */

import { z } from 'zod';

import { keys, redis, sessionService } from '@smart-dining/core';
import { UserPreferencesSchema } from '@smart-dining/shared';

import { jsonOk, parseBody, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ preferences: UserPreferencesSchema });

export const POST = withErrors<{ id: string }>(async (req, { params }) => {
  const { id } = ParamsSchema.parse(params);
  const body = await parseBody(req, BodySchema);
  const session = await sessionService.updatePreferences(id, body.preferences);

  // Bust the picks cache so the next fetch reflects the new prefs.
  await redis.del(`${keys.session(id)}:picks`).catch(() => undefined);

  return jsonOk({
    preferences: session.preferences,
    language: session.language,
  });
});
