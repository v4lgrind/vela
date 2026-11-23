import { describe, expect, it } from 'vitest';

import type { MediaVersion, SubtitleStream } from '@/domain';

import { createSubtitleTracks, isBurnInSubtitleStream, parseSavedBurnInSubtitleIndex } from './subtitleTracks';

const subtitle = (id: string, extra: Partial<SubtitleStream> = {}): SubtitleStream => ({
  id, isDefault: false, isForced: false, isHearingImpaired: false, isExternal: false, format: 'text', ...extra,
});
const version = (subtitles: SubtitleStream[]): MediaVersion => ({ id: 'v', video: [], audio: [], subtitles });
const VTT = 'https://jellyfin.example.test/Videos/item-id/source-id/Subtitles/5/0/Stream.vtt';

describe('createSubtitleTracks', () => {
  it('keeps PGS streams as burn-in choices without inventing a sidecar URL', () => {
    const pgs = subtitle('3', { codec: 'PGSSUB', language: 'fra', title: 'PGS French Complets - PGSSUB', format: 'image' });
    expect(createSubtitleTracks(version([pgs]), [])).toEqual([{
      index: 3, language: 'fra', label: 'PGS French Complets - PGSSUB', playbackMode: 'burn-in', deliveryUrl: undefined,
    }]);
  });

  it('uses the server sidecar URL for text streams it serves', () => {
    const tracks = createSubtitleTracks(version([subtitle('5', { language: 'eng' })]), [{ streamId: '5', url: VTT, format: 'vtt' }]);
    expect(tracks[0]).toMatchObject({ index: 5, playbackMode: 'external', deliveryUrl: VTT, label: 'ENG' });
  });

  it('falls back to burn-in for a text stream the server does not serve as a sidecar', () => {
    expect(createSubtitleTracks(version([subtitle('4')]), [])[0].playbackMode).toBe('burn-in');
  });

  it('labels forced tracks without a title', () => {
    expect(createSubtitleTracks(version([subtitle('6', { language: 'fra', isForced: true })]), [])[0].label).toBe('FRA (Forced)');
  });
});

describe('isBurnInSubtitleStream', () => {
  it('treats image subtitles as burn-in before negotiation', () => {
    expect(isBurnInSubtitleStream({ format: 'image' })).toBe(true);
    expect(isBurnInSubtitleStream({ format: 'text' })).toBe(false);
  });
});

describe('parseSavedBurnInSubtitleIndex', () => {
  it('returns only valid persisted burn-in stream indexes', () => {
    expect(parseSavedBurnInSubtitleIndex('burn-in:3')).toBe(3);
    expect(parseSavedBurnInSubtitleIndex('French')).toBeNull();
    expect(parseSavedBurnInSubtitleIndex('off')).toBeNull();
    expect(parseSavedBurnInSubtitleIndex('burn-in:nope')).toBeNull();
  });
});
