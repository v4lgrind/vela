import { describe, expect, it } from 'vitest';

import type { MediaStream } from '@/types/jellyfin';

import { createSubtitleTracks, isBurnInSubtitleStream, parseSavedBurnInSubtitleIndex } from './subtitleTracks';

const BASE_OPTIONS = {
  serverUrl: 'https://jellyfin.example.test',
  itemId: 'item-id',
  mediaSourceId: 'source-id',
};

describe('createSubtitleTracks', () => {
  it('keeps PGS streams as burn-in choices without inventing a VTT URL', () => {
    const streams: MediaStream[] = [{
      Index: 3,
      Type: 'Subtitle',
      Codec: 'PGSSUB',
      Language: 'fra',
      DisplayTitle: 'PGS French Complets - PGSSUB',
      IsTextSubtitleStream: false,
      SupportsExternalStream: true,
    }];

    expect(createSubtitleTracks({ ...BASE_OPTIONS, streams })).toEqual([{
      index: 3,
      language: 'fra',
      label: 'PGS French Complets - PGSSUB',
      playbackMode: 'burn-in',
      deliveryUrl: undefined,
    }]);
  });

  it('constructs extraction URLs only for externally playable text streams', () => {
    const streams: MediaStream[] = [{
      Index: 5,
      Type: 'Subtitle',
      Codec: 'srt',
      Language: 'eng',
      IsTextSubtitleStream: true,
      SupportsExternalStream: true,
    }];

    expect(createSubtitleTracks({ ...BASE_OPTIONS, streams })[0]).toMatchObject({
      index: 5,
      playbackMode: 'external',
      deliveryUrl: 'https://jellyfin.example.test/Videos/item-id/source-id/Subtitles/5/0/Stream.vtt',
    });
  });
});

describe('isBurnInSubtitleStream', () => {
  it('treats non-text (PGS) subtitle streams as burn-in', () => {
    expect(isBurnInSubtitleStream({
      Index: 3, Type: 'Subtitle', IsTextSubtitleStream: false, SupportsExternalStream: true,
    })).toBe(true);
  });

  it('treats text subtitles without external delivery as burn-in (matches createSubtitleTracks)', () => {
    const stream: MediaStream = {
      Index: 4, Type: 'Subtitle', IsTextSubtitleStream: true, SupportsExternalStream: false,
    };
    expect(isBurnInSubtitleStream(stream)).toBe(true);
    expect(createSubtitleTracks({ ...BASE_OPTIONS, streams: [stream] })[0].playbackMode).toBe('burn-in');
  });

  it('does not treat externally playable text subtitles as burn-in', () => {
    expect(isBurnInSubtitleStream({
      Index: 5, Type: 'Subtitle', IsTextSubtitleStream: true, SupportsExternalStream: true,
    })).toBe(false);
  });

  it('ignores non-subtitle streams', () => {
    expect(isBurnInSubtitleStream({ Index: 0, Type: 'Video' })).toBe(false);
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
