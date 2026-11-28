import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import type { Track } from '@/domain';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import type { MusicTarget } from '@/utils/musicActions';

import { useMusicActions } from './useMusicActions';

const { push, albumTracks, startRadio } = vi.hoisted(() => ({ push: vi.fn(), albumTracks: vi.fn(), startRadio: vi.fn() }));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: { id: 'page' } }),
}));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/session-store', () => ({
  useSessionStore: () => ({ backend: { capabilities: { radio: true }, music: { albumTracks } } }),
}));
vi.mock('@/store/offline-store', () => ({ useOfflineStore: () => ({ isFullyOnline: true }) }));
vi.mock('@/services/audioPlayerService', () => ({ audioPlayerService: { startRadio } }));

const domainTrack = (id: string) => ({
  id, kind: 'track', title: id, albumId: 'al1', artists: [], albumArtists: [], images: {}, versions: [],
}) as unknown as Track;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useMusicActions', () => {
  it('closes the player and opens the artist page', async () => {
    const audio = useAudioPlayerStore();
    audio.isExpanded = true;
    await useMusicActions().run({ type: 'goToArtist', itemId: 'a1', name: 'X' }, { kind: 'track', id: 't1', artists: [] });
    expect(audio.isExpanded).toBe(false);
    expect(push).toHaveBeenCalledWith({ name: 'ItemDetails', params: { id: 'a1' } });
  });

  it('queues the tracks of an album', async () => {
    albumTracks.mockResolvedValue([domainTrack('x'), domainTrack('y')]);
    const audio = useAudioPlayerStore();
    await useMusicActions().run({ type: 'addToQueue' }, { kind: 'album', id: 'al1', artists: [] });
    expect(albumTracks).toHaveBeenCalledWith('al1');
    expect(audio.queue.map((t) => t.id)).toEqual(['x', 'y']);
  });

  it('queues a given track without asking the server', async () => {
    const audio = useAudioPlayerStore();
    await useMusicActions().run({ type: 'playNext' }, { kind: 'track', id: 'x', artists: [] }, domainTrack('x'));
    expect(albumTracks).not.toHaveBeenCalled();
    expect(audio.queue.map((t) => t.id)).toEqual(['x']);
  });

  it('starts a radio and closes nothing', async () => {
    const target: MusicTarget = { kind: 'album', id: 'al1', artists: [] };
    await useMusicActions().run({ type: 'radio', seedId: 'al1' }, target);
    expect(startRadio).toHaveBeenCalledWith(target);
  });

  it('hides links to the page it is shown on', () => {
    const actions = useMusicActions().actionsFor({ kind: 'track', id: 't1', albumId: 'page', artists: [] });
    expect(actions.map((a) => a.type)).toEqual(['radio', 'playNext', 'addToQueue']);
  });
});
