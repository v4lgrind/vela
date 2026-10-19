import { CastAudio } from '@/plugins/CastAudioPlugin';
import type { RepeatMode } from '@/store/audio-player-store';
import { logger } from '@/utils/logger';
import { toEngineState, toNativeTrack } from './nativeAudioEngine';
import type { AudioEngine, EngineState, QueueItem } from './types';

function run(label: string, p: Promise<unknown>) {
  p.catch((e) => logger.error(`[CastAudio] ${label} failed`, e));
}

/**
 * Plays the queue on a Google Cast device (Default Media Receiver). Keeps a
 * copy of the queue because the receiver can't swap the tracks around the
 * current one, so shuffle reloads the whole queue.
 */
export class CastAudioEngine implements AudioEngine {
  private items: QueueItem[] = [];
  private repeatMode: RepeatMode = 'off';
  private last: EngineState | null = null;

  async setQueue(items: QueueItem[], startIndex: number, opts: { position?: number; autoplay?: boolean } = {}) {
    this.items = items;
    await CastAudio.setQueue({
      tracks: items.map(toNativeTrack),
      startIndex,
      startPositionMs: Math.round((opts.position ?? 0) * 1000),
      playWhenReady: opts.autoplay ?? true,
      repeatMode: this.repeatMode,
    });
  }

  async insert(index: number, items: QueueItem[]) {
    this.items.splice(index, 0, ...items);
    await CastAudio.addTracks({ index, tracks: items.map(toNativeTrack) });
  }

  remove(index: number) {
    this.items.splice(index, 1);
    run('removeTrack', CastAudio.removeTrack({ index }));
  }

  move(from: number, to: number) {
    const [item] = this.items.splice(from, 1);
    this.items.splice(to, 0, item);
    run('moveTrack', CastAudio.moveTrack({ from, to }));
  }

  async replaceAroundCurrent(before: QueueItem[], after: QueueItem[]) {
    const current = this.items[this.last?.index ?? -1];
    if (!current) return;
    await this.setQueue([...before, current, ...after], before.length, {
      position: this.last?.position,
      autoplay: this.last?.isPlaying,
    });
  }

  setRepeatMode(mode: RepeatMode) {
    this.repeatMode = mode;
    run('setRepeatMode', CastAudio.setRepeatMode({ mode }));
  }

  play() { run('play', CastAudio.play()); }
  pause() { run('pause', CastAudio.pause()); }
  seek(seconds: number) { run('seekTo', CastAudio.seekTo({ positionMs: Math.round(seconds * 1000) })); }
  skipTo(index: number) { run('skipTo', CastAudio.skipTo({ index })); }
  next() { run('next', CastAudio.next()); }
  previous() { run('previous', CastAudio.previous()); }
  setVolume(volume: number) { run('setVolume', CastAudio.setVolume({ volume })); }

  stop() {
    this.items = [];
    run('stop', CastAudio.stop());
  }

  onState(handler: (s: EngineState) => void) {
    CastAudio.addListener('stateChange', (raw) => {
      this.last = toEngineState(raw);
      handler(this.last);
    });
  }

  onError() {
    // Receiver errors surface as an idle state; nothing extra to report.
  }

  async restore() { return null; }
}
