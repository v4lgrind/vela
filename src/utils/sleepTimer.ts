import type { AudioTrack } from '@/store/audio-player-store';

export type SleepMode = 'minutes' | 'endOfTrack' | 'endOfAlbum';

export interface SleepTimer {
  mode: SleepMode;
  /** Epoch ms of the pause, `minutes` mode only. */
  endsAt?: number;
  /** Queue index playing when the timer was set. */
  armedIndex: number;
}

/** What a playback engine is asked to do; `null` cancels. */
export interface SleepTimerRequest {
  mode: SleepMode;
  minutes?: number;
}

interface PlaybackView {
  now: number;
  queue: AudioTrack[];
  currentIndex: number;
}

const MS_PER_SECOND = 1000;

/** Duration of the tracks right after `index` that belong to the same album. */
function restOfAlbum(queue: AudioTrack[], index: number): number {
  const albumId = queue[index]?.albumId;
  let total = 0;
  for (let i = index + 1; i < queue.length && queue[i].albumId === albumId; i++) total += queue[i].duration;
  return total;
}

/** Seconds left before the pause, for display. */
export function sleepRemaining(t: SleepTimer, s: PlaybackView & { currentTime: number; duration: number }): number {
  if (t.mode === 'minutes') return Math.max(0, ((t.endsAt ?? s.now) - s.now) / MS_PER_SECOND);
  const restOfTrack = Math.max(0, s.duration - s.currentTime);
  return t.mode === 'endOfTrack' ? restOfTrack : restOfTrack + restOfAlbum(s.queue, s.currentIndex);
}

/** Timer kept in JS (Cast, web preview): pause now? */
export function sleepShouldPause(t: SleepTimer, s: PlaybackView): boolean {
  if (t.mode === 'minutes') return s.now >= (t.endsAt ?? 0);
  if (t.mode === 'endOfTrack') return s.currentIndex !== t.armedIndex;
  return s.queue[s.currentIndex]?.albumId !== s.queue[t.armedIndex]?.albumId;
}
