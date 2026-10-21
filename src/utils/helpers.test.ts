import { describe, it, expect, beforeEach } from 'vitest';

import { setLocale } from '@/i18n';
import {
  formatTime,
  formatBytes,
  formatTicksDuration,
  formatTicksHuman,
  typeLabel,
  isAudioType,
} from './helpers';

describe('formatTime', () => {
  it('formats sub-hour durations as M:SS', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(599)).toBe('9:59');
  });

  it('formats hour-plus durations as H:MM:SS', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
  });

  it('guards against NaN / falsy input', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });
});

describe('formatBytes', () => {
  beforeEach(() => setLocale('fr'));

  it('uses English units in English', () => {
    setLocale('en');
    expect(formatBytes(2048)).toBe('2.00 KB');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('returns null for empty or non-positive sizes', () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(undefined)).toBeNull();
  });

  it('scales into Ko / Mo / Go / To with locale units', () => {
    expect(formatBytes(2048)).toBe('2.00 Ko');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 Mo');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 Go');
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.00 To');
  });

  it('keeps sub-1Ko values in octets', () => {
    expect(formatBytes(512)).toBe('512 octets');
  });

  it('varies decimal precision by magnitude (>=100 → 0dp, >=10 → 1dp)', () => {
    expect(formatBytes(150 * 1024)).toBe('150 Ko');
    expect(formatBytes(15 * 1024)).toBe('15.0 Ko');
  });
});

describe('formatTicksHuman', () => {
  beforeEach(() => setLocale('en'));

  it('returns null for missing ticks', () => {
    expect(formatTicksHuman(undefined)).toBeNull();
    expect(formatTicksHuman(0)).toBeNull();
  });

  it('formats minutes-only and hour+minutes', () => {
    expect(formatTicksHuman(30 * 60 * 10_000_000)).toBe('30m');
    expect(formatTicksHuman(90 * 60 * 10_000_000)).toBe('1h 30m');
  });

  it('formats in French', () => {
    setLocale('fr');
    expect(formatTicksHuman(90 * 60 * 10_000_000)).toBe('1 h 30 min');
  });
});

describe('typeLabel', () => {
  it('maps known Jellyfin types to English labels', () => {
    setLocale('en');
    expect(typeLabel('Movie')).toBe('Movie');
    expect(typeLabel('Series')).toBe('Series');
    expect(typeLabel('Episode')).toBe('Episode');
    expect(typeLabel('Person')).toBe('Person');
  });

  it('maps known Jellyfin types to French labels', () => {
    setLocale('fr');
    expect(typeLabel('Movie')).toBe('Film');
    expect(typeLabel('Series')).toBe('Série');
    expect(typeLabel('Episode')).toBe('Épisode');
    expect(typeLabel('Person')).toBe('Personne');
  });

  it('passes through unknown types and empties undefined', () => {
    expect(typeLabel('Trailer')).toBe('Trailer');
    expect(typeLabel(undefined)).toBe('');
  });
});

describe('isAudioType', () => {
  it('is true for audio-bearing types', () => {
    expect(isAudioType('Audio')).toBe(true);
    expect(isAudioType('MusicAlbum')).toBe(true);
    expect(isAudioType('MusicArtist')).toBe(true);
  });

  it('is false for video types', () => {
    expect(isAudioType('Movie')).toBe(false);
    expect(isAudioType('Episode')).toBe(false);
  });
});

describe('formatTicksDuration', () => {
  it('converts Jellyfin ticks (100ns units) to M:SS', () => {
    // 90 seconds = 90 * 10_000_000 ticks
    expect(formatTicksDuration(90 * 10_000_000)).toBe('1:30');
  });

  it('returns empty string for missing ticks', () => {
    expect(formatTicksDuration(undefined)).toBe('');
    expect(formatTicksDuration(0)).toBe('');
  });
});
