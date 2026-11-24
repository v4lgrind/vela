import { describe, expect, it } from 'vitest';

import { activeLyricIndex } from './lyrics';

describe('activeLyricIndex', () => {
  const lines = [{ text: 'a', startMs: 5000 }, { text: 'b', startMs: 10_000 }, { text: 'c', startMs: 20_000 }];

  it('is -1 before the first line', () => {
    expect(activeLyricIndex(lines, 2)).toBe(-1);
  });

  it('is the last line that has started', () => {
    expect(activeLyricIndex(lines, 5)).toBe(0);
    expect(activeLyricIndex(lines, 19.9)).toBe(1);
    expect(activeLyricIndex(lines, 300)).toBe(2);
  });

  it('never activates unsynced lines', () => {
    expect(activeLyricIndex([{ text: 'a', startMs: null }], 100)).toBe(-1);
  });
});
