import { describe, expect, it } from 'vitest';
import { activeLyricIndex, toLyricLines } from './lyrics';

describe('toLyricLines', () => {
  it('converts start ticks to seconds', () => {
    const lines = toLyricLines({ Lyrics: [{ Text: 'a', Start: 0 }, { Text: 'b', Start: 125_000_000 }] });
    expect(lines).toEqual({ synced: true, lines: [{ text: 'a', start: 0 }, { text: 'b', start: 12.5 }] });
  });

  it('is unsynced when lines have no start', () => {
    const lines = toLyricLines({ Lyrics: [{ Text: 'a' }, { Text: 'b', Start: null }] });
    expect(lines).toEqual({ synced: false, lines: [{ text: 'a', start: null }, { text: 'b', start: null }] });
  });

  it('returns null when there are no lines', () => {
    expect(toLyricLines({ Lyrics: [] })).toBeNull();
    expect(toLyricLines({})).toBeNull();
  });
});

describe('activeLyricIndex', () => {
  const lines = [{ text: 'a', start: 5 }, { text: 'b', start: 10 }, { text: 'c', start: 20 }];

  it('is -1 before the first line', () => {
    expect(activeLyricIndex(lines, 2)).toBe(-1);
  });

  it('is the last line that has started', () => {
    expect(activeLyricIndex(lines, 5)).toBe(0);
    expect(activeLyricIndex(lines, 19.9)).toBe(1);
    expect(activeLyricIndex(lines, 300)).toBe(2);
  });
});
