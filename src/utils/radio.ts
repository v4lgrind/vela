import type { MusicPort, Track } from '@/domain';
import type { AudioTrack } from '@/store/audio-player-store';

import { radioQueue } from './audioQueue';
import { trackToAudioTrack } from './audioTrack';
import type { MusicTarget } from './musicActions';

/** Tracks fetched per radio batch (start and each top-up). */
export const RADIO_BATCH = 100;

/**
 * The queue of a new radio: a track radio starts with that track (`seed`),
 * an album or artist radio with the first track of the mix.
 * Throws when the server has nothing to add.
 */
export async function loadRadio(music: MusicPort, target: MusicTarget, seed?: Track): Promise<AudioTrack[]> {
  const mix = await music.radio(target.id, RADIO_BATCH);
  const queue = radioQueue(seed ?? null, mix);
  if (queue.length <= (seed ? 1 : 0)) throw new Error('empty radio');
  return queue.map((track) => trackToAudioTrack(track));
}
