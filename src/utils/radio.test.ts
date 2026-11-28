import { describe, expect, it, vi } from 'vitest';

import type { MusicPort, Track } from '@/domain';

import { loadRadio, RADIO_BATCH } from './radio';

const domainTrack = (id: string) => ({
  id, kind: 'track', title: id, artists: [], albumArtists: [], images: {}, versions: [],
}) as unknown as Track;

const music = (mix: Track[] | Error) => ({
  radio: vi.fn(async () => { if (mix instanceof Error) throw mix; return mix; }),
}) as unknown as MusicPort;

describe('loadRadio', () => {
  it('starts a track radio with that track', async () => {
    const port = music([domainTrack('x'), domainTrack('t1')]);
    const queue = await loadRadio(port, { kind: 'track', id: 't1', artists: [] }, domainTrack('t1'));
    expect(queue.map((t) => t.id)).toEqual(['t1', 'x']);
    expect(port.radio).toHaveBeenCalledWith('t1', RADIO_BATCH);
  });

  it('starts an album radio with the first track of the mix', async () => {
    const queue = await loadRadio(music([domainTrack('x'), domainTrack('y')]), { kind: 'album', id: 'al', artists: [] });
    expect(queue.map((t) => t.id)).toEqual(['x', 'y']);
  });

  it('fails when the server has nothing to mix', async () => {
    await expect(loadRadio(music([]), { kind: 'album', id: 'al', artists: [] })).rejects.toThrow('empty radio');
    await expect(loadRadio(music([domainTrack('t1')]), { kind: 'track', id: 't1', artists: [] }, domainTrack('t1')))
      .rejects.toThrow('empty radio');
  });

  it('passes server errors on', async () => {
    await expect(loadRadio(music(new Error('500')), { kind: 'album', id: 'al', artists: [] })).rejects.toThrow('500');
  });
});
