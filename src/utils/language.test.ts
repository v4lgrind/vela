import { describe, it, expect } from 'vitest';
import { languageMatches } from './language';

describe('languageMatches', () => {
  // The bug: preferences store ISO 639-2 (3-letter) codes, but ExoPlayer
  // reports ISO 639-1 (2-letter) normalised codes. Matching must bridge them.
  it('matches a 3-letter preference against a 2-letter track code', () => {
    expect(languageMatches('fra', 'fr')).toBe(true);
    expect(languageMatches('eng', 'en')).toBe(true);
    expect(languageMatches('jpn', 'ja')).toBe(true);
    expect(languageMatches('zho', 'zh')).toBe(true);
  });

  it('matches identical codes (both 2- or both 3-letter)', () => {
    expect(languageMatches('fr', 'fr')).toBe(true);
    expect(languageMatches('fra', 'fra')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(languageMatches('FRA', 'fr')).toBe(true);
    expect(languageMatches('eng', 'EN')).toBe(true);
  });

  it('accepts bibliographic 3-letter alternates (fre/ger/chi)', () => {
    expect(languageMatches('fra', 'fre')).toBe(true);
    expect(languageMatches('deu', 'ger')).toBe(true);
  });

  it('does not match different languages', () => {
    expect(languageMatches('eng', 'fr')).toBe(false);
    expect(languageMatches('fra', 'es')).toBe(false);
  });

  it('returns false for empty or undetermined codes', () => {
    expect(languageMatches('', 'fr')).toBe(false);
    expect(languageMatches('fra', '')).toBe(false);
    expect(languageMatches('fra', 'und')).toBe(false);
    expect(languageMatches('und', 'fr')).toBe(false);
  });
});
