import { describe, expect, it } from 'vitest';

import { toEngineState } from './nativeAudioEngine';
import { positionLeftAt } from './position';
import type { EngineState } from './types';

const state = (over: Partial<EngineState> = {}): EngineState => ({
  index: 1, trackId: 'b', isPlaying: true, ended: false, position: 0, duration: 200, ...over,
});

describe('positionLeftAt', () => {
  it('uses where the engine says the reported track was left', () => {
    expect(positionLeftAt('a', 3, state({ previousTrackId: 'a', previousPosition: 187 }))).toBe(187);
  });

  it('keeps the last tick when the transition is about another track', () => {
    expect(positionLeftAt('a', 42, state({ previousTrackId: 'x', previousPosition: 187 }))).toBe(42);
  });

  it('keeps the last tick when the engine reports no transition', () => {
    expect(positionLeftAt('a', 42, state())).toBe(42);
    expect(positionLeftAt('', 0, state({ previousTrackId: '', previousPosition: 0 }))).toBe(0);
  });
});

describe('toEngineState', () => {
  it('maps the previous track position to seconds', () => {
    const s = toEngineState({
      index: 1, trackId: 'b', isPlaying: true, ended: false, positionMs: 1500, durationMs: 200_000,
      previousTrackId: 'a', previousPositionMs: 187_250,
    });
    expect(s).toMatchObject({ position: 1.5, duration: 200, previousTrackId: 'a', previousPosition: 187.25 });
  });
});
