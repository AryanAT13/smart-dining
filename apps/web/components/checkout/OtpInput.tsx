'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils/cn';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  length?: number;
}

export function OtpInput({ value, onChange, autoFocus, length = 6 }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setAt = (i: number, ch: string) => {
    const cleaned = ch.replace(/\D/g, '').slice(0, 1);
    const next = digits.slice();
    next[i] = cleaned || ' ';
    const out = next.join('').trimEnd();
    onChange(out);
    if (cleaned && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i]?.trim() && i > 0) {
      refs.current[i - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (text) {
      e.preventDefault();
      onChange(text);
      refs.current[Math.min(text.length, length - 1)]?.focus();
    }
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="OTP">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={digits[i]?.trim() ?? ''}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          className={cn(
            'h-12 w-10 rounded-md border border-input bg-background text-center text-xl font-semibold ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        />
      ))}
    </div>
  );
}
