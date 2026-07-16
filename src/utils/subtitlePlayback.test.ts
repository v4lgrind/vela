import { describe, expect, it } from 'vitest';

import {
  isBitmapSubtitleCodec,
  requiresSubtitleBurnIn,
} from './subtitlePlayback';

describe('subtitle playback compatibility', () => {
  it.each([
    'pgs',
    'pgsub',
    'PGSSUB',
    'hdmv_pgs_subtitle',
    'dvdsub',
    'dvd_subtitle',
    'dvbsub',
    'dvb_subtitle',
    'vobsub',
  ])(
    'classifies %s as a bitmap subtitle',
    (codec) => {
      expect(isBitmapSubtitleCodec(codec)).toBe(true);
    },
  );

  it.each(['ass', 'ssa', 'srt', 'subrip', 'vtt'])(
    'keeps %s as a text subtitle',
    (codec) => {
      expect(isBitmapSubtitleCodec(codec)).toBe(false);
    },
  );

  it('never burns a stream explicitly marked as text', () => {
    expect(requiresSubtitleBurnIn({
      Codec: 'pgs',
      IsTextSubtitleStream: true,
    })).toBe(false);
  });
});
