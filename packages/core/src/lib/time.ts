/**
 * Time-of-day classification per spec §5.7.
 *
 * Uses the restaurant timezone (env.RESTAURANT_TIMEZONE) so the same UTC
 * timestamp classifies correctly regardless of where the server runs.
 */

import { env } from '../config/env.js';

export type TimeOfDay = 'breakfast' | 'lunch' | 'evening' | 'dinner' | 'late_night';

/**
 * Classify a Date into the spec's time buckets.
 *
 * Breakfast: 07:00–10:59
 * Lunch:     11:00–14:59
 * Evening:   15:00–18:59
 * Dinner:    19:00–22:59
 * Late:      23:00–06:59
 */
export function classifyTimeOfDay(now: Date = new Date(), timezone = env.RESTAURANT_TIMEZONE): TimeOfDay {
  const hour = getHourIn(now, timezone);
  if (hour >= 7 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 19) return 'evening';
  if (hour >= 19 && hour < 23) return 'dinner';
  return 'late_night';
}

function getHourIn(date: Date, timezone: string): number {
  // Intl.DateTimeFormat with hour cycle h23 always returns 0-23.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour');
  return hourPart ? Number.parseInt(hourPart.value, 10) : date.getHours();
}

/**
 * Spec §5.4 evening-special trigger window.
 */
export function isEveningSpecialWindow(now: Date = new Date()): boolean {
  const hour = getHourIn(now, env.RESTAURANT_TIMEZONE);
  return hour >= 17 && hour < 20;
}

export function plusMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function plusHours(date: Date, hours: number): Date {
  return plusMinutes(date, hours * 60);
}

export const SESSION_TTL_HOURS = 4;
export const SESSION_TTL_SECONDS = SESSION_TTL_HOURS * 60 * 60;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_VERIFY_TOKEN_TTL_SECONDS = 10 * 60;
