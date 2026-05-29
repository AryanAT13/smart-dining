'use client';

import { useEffect, useState } from 'react';

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
import { useIdentityStore } from '@/lib/stores/identity';

/**
 * First-visit name prompt. Skipped on subsequent visits.
 * In Phase 2 the Greeter Agent's "what's the vibe today?" two-question
 * onboarding lives downstream of this name prompt.
 */
export function OnboardingDialog() {
  const hasOnboarded = useIdentityStore((s) => s.hasOnboarded);
  const setDisplayName = useIdentityStore((s) => s.setDisplayName);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  useEffect(() => {
    setOpen(!hasOnboarded);
  }, [hasOnboarded]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    setDisplayName(trimmed);
    setOpen(false);
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Welcome to Zaika</DialogTitle>
          <DialogDescription>
            What should we call you? Shows up on items you add to the shared cart.
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
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, 50))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            className="text-base"
          />
          <Button
            type="button"
            size="lg"
            className="w-full tap-target"
            disabled={value.trim().length === 0}
            onClick={submit}
          >
            Start ordering
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
