'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { useChatStore } from '@/lib/stores/chat';
import { useIdentityStore } from '@/lib/stores/identity';
import { cn } from '@/lib/utils/cn';

import {
  AllergenChips,
  vibesToPreferences,
  VibeChips,
  type AllergenKey,
  type VibeKey,
} from './VibeChips';

type Step = 'name' | 'vibe';

/**
 * Two-step micro-onboarding aligned with spec §11 Flow 1.
 *
 * Persistence: we deliberately bypass the Zustand persist middleware and
 * touch localStorage directly. The Zustand hydration callback fires AFTER
 * first render in Next.js App Router, which created a race where the
 * dialog opened against the default `hasOnboarded: false` before the
 * persisted `true` arrived. Direct localStorage is synchronous on first
 * render and avoids that race entirely.
 *
 * Source of truth keys: `zaika.onboarded` (string "true") and
 * `zaika.displayName` (string). We mirror back into the Zustand store
 * for the rest of the app to read.
 */

const LS_ONBOARDED = 'zaika.onboarded';
const LS_NAME = 'zaika.displayName';

function readOnboarded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LS_ONBOARDED) === 'true';
  } catch {
    return false;
  }
}

function writeOnboarded(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_ONBOARDED, 'true');
    window.localStorage.setItem(LS_NAME, name);
  } catch {
    /* private mode or quota — fall back to in-memory */
  }
}

function readPersistedName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LS_NAME);
  } catch {
    return null;
  }
}

export function OnboardingDialog() {
  const setDisplayName = useIdentityStore((s) => s.setDisplayName);
  const completeOnboarding = useIdentityStore((s) => s.completeOnboarding);
  const sessionId = useIdentityStore((s) => s.sessionId);
  const queryClient = useQueryClient();
  const setChatOpen = useChatStore((s) => s.setOpen);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('name');
  const [nameDraft, setNameDraft] = useState('');
  const [vibes, setVibes] = useState<Set<VibeKey>>(new Set());
  const [allergens, setAllergens] = useState<Set<AllergenKey>>(new Set());
  const initialised = useRef(false);

  // Mount-only: check localStorage directly. If already onboarded, mirror
  // the saved name into the Zustand store and leave the dialog closed.
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const onboarded = readOnboarded();
    if (onboarded) {
      const savedName = readPersistedName();
      if (savedName) {
        setDisplayName(savedName);
      }
      completeOnboarding();
      setOpen(false);
    } else {
      setOpen(true);
    }
  }, [completeOnboarding, setDisplayName]);

  const persistPrefs = useMutation({
    mutationFn: (prefs: UserPreferences) => {
      if (!sessionId) throw new Error('No active session');
      return updateSessionPreferences(sessionId, prefs);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not save preferences.');
    },
  });

  const finish = (name: string) => {
    setDisplayName(name);
    completeOnboarding();
    writeOnboarded(name);
    setOpen(false);
    setStep('name');
  };

  const submitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed.length === 0) return;
    setDisplayName(trimmed);
    setStep('vibe');
  };

  const savePrefsIfAny = async (): Promise<void> => {
    const patch = vibesToPreferences(vibes, allergens) as UserPreferences;
    if (Object.keys(patch).length === 0) return;
    try {
      await persistPrefs.mutateAsync(patch);
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['ai-picks', sessionId] });
      }
    } catch {
      /* toasted */
    }
  };

  const onJustBrowsing = () => {
    finish(nameDraft.trim() || 'Guest');
  };

  const onTellMeWhatsGood = async () => {
    await savePrefsIfAny();
    finish(nameDraft.trim() || 'Guest');
    setChatOpen(true);
  };

  const onLetsOrder = async () => {
    await savePrefsIfAny();
    finish(nameDraft.trim() || 'Guest');
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
              <DialogTitle className="flex items-center gap-2 font-display">
                <Sparkles className="h-5 w-5 text-primary" />
                Welcome to Zaika
              </DialogTitle>
              <DialogDescription>
                I&apos;m Zara — your guide for the table. Quick intro before we
                order. What should I call you?
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
              <DialogTitle className="flex items-center gap-2 font-display">
                <Sparkles className="h-5 w-5 text-primary" />
                Hi {nameDraft}! What&apos;s the vibe today?
              </DialogTitle>
              <DialogDescription>
                Pick a path, or tap a few chips so I can shape the menu. You
                can change your mind anytime in chat.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={onJustBrowsing}
                  disabled={persistPrefs.isPending}
                  className="tap-target h-auto whitespace-normal py-3 leading-snug"
                >
                  Just browsing
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => void onTellMeWhatsGood()}
                  disabled={persistPrefs.isPending}
                  className="tap-target h-auto whitespace-normal py-3 leading-snug"
                >
                  {persistPrefs.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Tell me what&apos;s good
                </Button>
              </div>

              <div className={cn('relative my-1')}>
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <span className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    or pick a vibe
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <VibeChips selected={vibes} onChange={setVibes} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Anything to avoid?{' '}
                  <span className="font-normal normal-case">(optional)</span>
                </p>
                <AllergenChips selected={allergens} onChange={setAllergens} />
              </div>

              <Button
                type="button"
                size="lg"
                className="w-full tap-target"
                onClick={() => void onLetsOrder()}
                disabled={persistPrefs.isPending}
              >
                {persistPrefs.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Let&apos;s order
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
