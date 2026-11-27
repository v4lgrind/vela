import { NativeAudio, type NativeAudioState, type NativeAudioTrack } from '@/plugins/NativeAudioPlugin';
import type { AudioTrack, RepeatMode } from '@/store/audio-player-store';
import { logger } from '@/utils/logger';
import type { SleepTimerRequest } from '@/utils/sleepTimer';
import type { AudioEngine, EngineState, QueueItem } from './types';

export function toEngineState(s: NativeAudioState): EngineState {
  return {
    index: s.index,
    trackId: s.trackId,
    isPlaying: s.isPlaying,
    ended: s.ended,
    position: s.positionMs / 1000,
    duration: s.durationMs / 1000,
  };
}

export function toNativeTrack({ track, url, artworkUrl }: QueueItem): NativeAudioTrack {
  return {
    id: track.id,
    url,
    title: track.name,
    artist: track.artist,
    album: track.albumName,
    artworkUrl,
    track: { ...track },
  };
}

function run(label: string, p: Promise<unknown>) {
  p.catch((e) => logger.error(`[NativeAudio] ${label} failed`, e));
}

/** ExoPlayer in MusicService: background playback, notification, headset keys. */
export class NativeAudioEngine implements AudioEngine {
  async setQueue(items: QueueItem[], startIndex: number, opts: { position?: number; autoplay?: boolean } = {}) {
    await NativeAudio.setQueue({
      tracks: items.map(toNativeTrack),
      startIndex,
      startPositionMs: Math.round((opts.position ?? 0) * 1000),
      playWhenReady: opts.autoplay ?? true,
    });
  }

  async insert(index: number, items: QueueItem[]) {
    await NativeAudio.addTracks({ index, tracks: items.map(toNativeTrack) });
  }

  remove(index: number) { run('removeTrack', NativeAudio.removeTrack({ index })); }
  move(from: number, to: number) { run('moveTrack', NativeAudio.moveTrack({ from, to })); }

  async replaceAroundCurrent(before: QueueItem[], after: QueueItem[]) {
    await NativeAudio.replaceAroundCurrent({
      before: before.map(toNativeTrack),
      after: after.map(toNativeTrack),
    });
  }

  setRepeatMode(mode: RepeatMode) { run('setRepeatMode', NativeAudio.setRepeatMode({ mode })); }

  play() { run('play', NativeAudio.play()); }
  pause() { run('pause', NativeAudio.pause()); }
  seek(seconds: number) { run('seekTo', NativeAudio.seekTo({ positionMs: Math.round(seconds * 1000) })); }
  skipTo(index: number) { run('skipTo', NativeAudio.skipTo({ index })); }
  next() { run('next', NativeAudio.next()); }
  previous() { run('previous', NativeAudio.previous()); }
  setVolume(volume: number) { run('setVolume', NativeAudio.setVolume({ volume })); }
  stop() { run('stop', NativeAudio.stop()); }

  readonly ownsSleepTimer = true;
  setSleepTimer(request: SleepTimerRequest | null) {
    run('setSleepTimer', NativeAudio.setSleepTimer({ mode: request?.mode ?? 'off', minutes: request?.minutes }));
  }

  /** The service paused on its sleep timer. */
  onSleepTimerFired(handler: () => void) {
    NativeAudio.addListener('sleepTimerFired', handler);
  }

  onState(handler: (s: EngineState) => void) {
    NativeAudio.addListener('stateChange', (s) => handler(toEngineState(s)));
  }

  onError(handler: (message: string, network?: boolean) => void) {
    NativeAudio.addListener('error', (e) => handler(e.message, e.code?.startsWith('ERROR_CODE_IO_NETWORK')));
  }

  async restore() {
    const s = await NativeAudio.getState();
    if (!s.tracks.length || s.index < 0) return null;
    return { tracks: s.tracks as unknown as AudioTrack[], state: toEngineState(s) };
  }
}
