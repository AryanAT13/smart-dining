'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { UserPreferences } from '@smart-dining/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api/client';
import { updateSessionPreferences } from '@/lib/api/fetchers';
import { useIdentityStore } from '@/lib/stores/identity';

import {
  AllergenChips,
  vibesToPreferences,
  VibeChips,
  type AllergenKey,
  type VibeKey,
} from './VibeChips';

type Step = 'name' | 'vibe';

/**
 * Two-step micro-onboarding (per spec §11 Flow 1).
 *
 * Step 1: Display name — anchors cart attribution + socket identity.
 * Step 2: Vibe + allergen chips — seeds session preferences so the
 *         "Zara's picks for you" strip has signal from turn 0 instead
 *         of suffering the cold-start problem.
 *
 * "Surprise me" is exclusive: picking it deselects every other vibe and
 * persists no preference, which is its own meaningful signal.
 */
export function OnboardingDialog() {
  const hasOnboarded = useIdentityStore((s) => s.hasOnboarded);
  const setDisplayName = useIdentityStore((s) => s.setDisplayName);
  const sessionId = useIdentityStore((s) => s.sessionId);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('name');
  const [nameDraft, setNameDraft] = useState('');
  const [vibes, setVibes] = useState<Set<VibeKey>>(new Set());
  const [allergens, setAllergens] = useState<Set<AllergenKey>>(new Set());

  useEffect(() => {
    setOpen(!hasOnboarded);
  }, [hasOnboarded]);

  const persistPrefs = useMutation({
    mutationFn: (prefs: UserPreferences) => {
      if (!sessionId) throw new Error('No active session');
      return updateSessionPreferences(sessionId, prefs);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not save preferences.');
    },
  });

  const close = () => {
    setOpen(false);
    setStep('name');
  };

  const submitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed.length === 0) return;
    setDisplayName(trimmed);
    setStep('vibe');
  };

  const skipPrefs = () => close();

  const submitPrefs = async () => {
    const patch = vibesToPreferences(vibes, allergens) as UserPreferences;
    if (Object.keys(patch).length > 0) {
      try {
        await persistPrefs.mutateAsync(patch);
        // Invalidate the AI Picks query so the strip refetches with the
        // new preferences applied server-side.
        if (sessionId) {
          queryClient.invalidateQueries({ queryKey: ['ai-picks', sessionId] });
        }
      } catch {
        // Errors already toasted; don't block the user from continuing.
      }
    }
    close();
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md gap-4"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => step === 'name' && e.preventDefault()}
      >
        {step === 'name' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Welcome to Zaika
              </DialogTitle>
              <DialogDescription>
                I&apos;m Zara — quick intro before we order. What should I call you?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label htmlFor="display-name" className="sr-only">
                Display name
              </Label>
              <Input
                id="display-name"
                autoFocus
                placeholder="e.g. Priya"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value.slice(0, 50))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitName();
                }}
                className="text-base"
              />
              <Button
                type="button"
                size="lg"
                className="w-full tap-target"
                disabled={nameDraft.trim().length === 0}
                onClick={submitName}
              >
                Next
              </Button>
            </div>
          </>
        )}

        {step === 'vibe' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Hi {nameDraft}! What&apos;s the vibe today?
              </DialogTitle>
              <DialogDescription>
                Tap whatever fits — I&apos;ll line up the menu accordingly. You can change your mind anytime in chat.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Mood
                </p>
                <VibeChips selected={vibes} onChange={setVibes} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Anything to avoid?{' '}
                  <span className="font-normal normal-case">(optional)</span>
                </p>
                <AllergenChips selected={allergens} onChange={setAllergens} />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 tap-target"
                  onClick={skipPrefs}
                  disabled={persistPrefs.isPending}
                >
                  Skip
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="flex-1 tap-target"
                  onClick={() => void submitPrefs()}
                  disabled={persistPrefs.isPending}
                >
                  {persistPrefs.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Let&apos;s order
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
