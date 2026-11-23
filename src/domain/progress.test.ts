import { describe, expect, it } from 'vitest';

import { playedPercent, remainingMs } from './progress';

const item = (durationMs: number | undefined, resumePositionMs?: number) => ({
  durationMs,
  user: { played: false, playCount: 0, favorite: false, resumePositionMs },
});

describe('progress', () => {
  it('computes the watched share and the time left from the resume point', () => {
    expect(playedPercent(item(100_000, 25_000))).toBe(25);
    expect(remainingMs(item(100_000, 25_000))).toBe(75_000);
  });

  it('is zero when not started or the length is unknown', () => {
    expect(playedPercent(item(100_000))).toBe(0);
    expect(playedPercent(item(undefined, 5_000))).toBe(0);
    expect(remainingMs(item(undefined, 5_000))).toBe(0);
  });
});
