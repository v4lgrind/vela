import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { PERSISTED_AUDIO_STATE, registerAudioController, useAudioPlayerStore, type AudioController, type AudioTrack } from './audio-player-store';

const track = (id: string): AudioTrack => ({ id, name: id, artist: '', albumId: 'al', albumName: '', duration: 60, indexNumber: 1 });
const tracks = ['a', 'b', 'c'].map(track);

beforeEach(() => setActivePinia(createPinia()));

describe('audio player store: radio', () => {
  it('plays a radio in its order and remembers the seed', () => {
    const store = useAudioPlayerStore();
    store.libraryShuffle = 'lib';
    store.shuffle = true;
    store.playRadio('a', tracks);
    expect(store.radioSeed).toBe('a');
    expect(store.libraryShuffle).toBeNull();
    expect(store.queue.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(store.currentIndex).toBe(0);
  });

  it('forgets the radio when something else plays or the queue stops', () => {
    const store = useAudioPlayerStore();
    store.playRadio('a', tracks);
    store.playAlbum(tracks, 1);
    expect(store.radioSeed).toBeNull();
    store.playRadio('a', tracks);
    store.stop();
    expect(store.radioSeed).toBeNull();
  });
});

describe('audio player store: sleep timer', () => {
  it('arms a timer on the playing track and asks the engine', () => {
    const setSleepTimer = vi.fn();
    registerAudioController({ setQueue: vi.fn(), setSleepTimer } as unknown as AudioController);
    const store = useAudioPlayerStore();
    store.playAlbum(tracks, 1);
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    store.setSleepTimer('minutes', 15);
    expect(store.sleepTimer).toEqual({ mode: 'minutes', endsAt: 1_000 + 15 * 60_000, armedIndex: 1 });
    expect(setSleepTimer).toHaveBeenLastCalledWith({ mode: 'minutes', minutes: 15 });
    store.cancelSleepTimer();
    expect(store.sleepTimer).toBeNull();
    expect(setSleepTimer).toHaveBeenLastCalledWith(null);
  });

  it('is not saved with the queue', () => {
    expect(PERSISTED_AUDIO_STATE).toContain('queue');
    expect(PERSISTED_AUDIO_STATE).not.toContain('sleepTimer');
  });
});
