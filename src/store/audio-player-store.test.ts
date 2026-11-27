import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useAudioPlayerStore, type AudioTrack } from './audio-player-store';

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
