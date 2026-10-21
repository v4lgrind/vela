import { describe, it, expect } from 'vitest';

import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

import { resolveLocale } from './index';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flattenKeys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('resolveLocale', () => {
  it('maps device languages', () => {
    expect(resolveLocale('fr-FR')).toBe('fr');
    expect(resolveLocale('fr-CA')).toBe('fr');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('de-DE')).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('locale files', () => {
  it('fr and en define exactly the same keys', () => {
    expect(flattenKeys(fr).sort()).toEqual(flattenKeys(en).sort());
  });
});
