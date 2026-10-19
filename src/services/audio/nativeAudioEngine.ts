import { NativeAudio, type NativeAudioState } from '@/plugins/NativeAudioPlugin';
import type { AudioTrack } from '@/store/audio-player-store';
import { logger } from '@/utils/logger';
import type { AudioEngine, EngineState, QueueItem } from './types';

function toEngineState(s: NativeAudioState): EngineState {
  return {
    index: s.index,
    trackId: s.trackId,
    isPlaying: s.isPlaying,
    ended: s.ended,
    position: s.positionMs / 1000,
    duration: s.durationMs / 1000,
  };
}

function run(label: string, p: Promise<unknown>) {
  p.catch((e) => logger.error(`[NativeAudio] ${label} failed`, e));
}

/** ExoPlayer in MusicService: background playback, notification, headset keys. */
export class NativeAudioEngine implements AudioEngine {
  async setQueue(items: QueueItem[], startIndex: number) {
    await NativeAudio.setQueue({
      tracks: items.map(({ track, url, artworkUrl }) => ({
        id: track.id,
        url,
        title: track.name,
        artist: track.artist,
        album: track.albumName,
        artworkUrl,
        track: { ...track },
      })),
      startIndex,
      playWhenReady: true,
    });
  }

  play() { run('play', NativeAudio.play()); }
  pause() { run('pause', NativeAudio.pause()); }
  seek(seconds: number) { run('seekTo', NativeAudio.seekTo({ positionMs: Math.round(seconds * 1000) })); }
  skipTo(index: number) { run('skipTo', NativeAudio.skipTo({ index })); }
  next() { run('next', NativeAudio.next()); }
  previous() { run('previous', NativeAudio.previous()); }
  setVolume(volume: number) { run('setVolume', NativeAudio.setVolume({ volume })); }
  stop() { run('stop', NativeAudio.stop()); }

  onState(handler: (s: EngineState) => void) {
    NativeAudio.addListener('stateChange', (s) => handler(toEngineState(s)));
  }

  onError(handler: (message: string) => void) {
    NativeAudio.addListener('error', (e) => handler(e.message));
  }

  async restore() {
    const s = await NativeAudio.getState();
    if (!s.tracks.length || s.index < 0) return null;
    return { tracks: s.tracks as unknown as AudioTrack[], state: toEngineState(s) };
  }
}
