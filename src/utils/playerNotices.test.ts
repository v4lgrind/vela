import { describe, it, expect } from 'vitest';

import { i18n, setLocale } from '@/i18n';

import { isAudioRevertNotice } from './playerNotices';

describe('isAudioRevertNotice', () => {
  it('recognises the revert notice in every language', () => {
    for (const locale of ['en', 'fr'] as const) {
      setLocale(locale);
      expect(isAudioRevertNotice(i18n.global.t('player.errors.audioRevert'))).toBe(true);
    }
  });

  it('leaves other errors alone', () => {
    setLocale('fr');
    expect(isAudioRevertNotice(i18n.global.t('player.errors.generic'))).toBe(false);
    expect(isAudioRevertNotice(null)).toBe(false);
  });
});
