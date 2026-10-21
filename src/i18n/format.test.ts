import { describe, it, expect } from 'vitest';

import { formatDuration, formatRemaining } from './format';
import { i18n, setLocale } from './index';

describe('formatDuration / formatRemaining', () => {
  it('formats in English', () => {
    setLocale('en');
    expect(formatDuration(4380)).toBe('1h 13m');
    expect(formatDuration(1020)).toBe('17m');
    expect(formatRemaining(1020)).toBe('17m left');
  });

  it('formats in French', () => {
    setLocale('fr');
    expect(formatDuration(4380)).toBe('1 h 13 min');
    expect(formatDuration(1020)).toBe('17 min');
    expect(formatRemaining(1020)).toBe('Reste 17 min');
  });
});

describe('per-language punctuation', () => {
  it('puts the space before a colon in French only', () => {
    setLocale('en');
    expect(i18n.global.t('downloads.storageOf', { type: 'Movies', size: '1 GB' })).toBe('Movies: 1 GB');
    setLocale('fr');
    expect(i18n.global.t('downloads.storageOf', { type: 'Films', size: '1 Go' })).toBe('Films : 1 Go');
  });
});
