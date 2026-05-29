import './../setup';

import { describe, expect, it } from 'vitest';

import { classifyTimeOfDay, isEveningSpecialWindow } from '../../../src/lib/time.js';

const tz = 'Asia/Kolkata';

function at(hour: number): Date {
  // Build a Date that is "hour:00 IST" today. The classifier uses a
  // formatter to extract the hour in the configured tz, so any source tz
  // works as long as the wall-clock hour is what we expect.
  const d = new Date();
  d.setUTCHours(hour - 5, -30, 0, 0); // crude IST = UTC+5:30
  return d;
}

describe('time.classifyTimeOfDay', () => {
  it('classifies 08:00 IST as breakfast', () => {
    expect(classifyTimeOfDay(at(8), tz)).toBe('breakfast');
  });
  it('classifies 13:00 IST as lunch', () => {
    expect(classifyTimeOfDay(at(13), tz)).toBe('lunch');
  });
  it('classifies 17:30 IST as evening', () => {
    const d = at(17);
    d.setUTCMinutes(d.getUTCMinutes() + 30);
    expect(classifyTimeOfDay(d, tz)).toBe('evening');
  });
  it('classifies 20:00 IST as dinner', () => {
    expect(classifyTimeOfDay(at(20), tz)).toBe('dinner');
  });
  it('classifies 02:00 IST as late_night', () => {
    expect(classifyTimeOfDay(at(2), tz)).toBe('late_night');
  });
});

describe('time.isEveningSpecialWindow', () => {
  it('is true at 18:00 IST', () => {
    expect(isEveningSpecialWindow(at(18))).toBe(true);
  });
  it('is false at 21:00 IST', () => {
    expect(isEveningSpecialWindow(at(21))).toBe(false);
  });
});
