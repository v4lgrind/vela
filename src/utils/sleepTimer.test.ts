import { describe, expect, it } from 'vitest';

import type { AudioTrack } from '@/store/audio-player-store';

import { sleepRemaining, sleepShouldPause } from './sleepTimer';
import type { SleepTimer } from './sleepTimer';

const track = (id: string, albumId: string, duration = 100): AudioTrack =>
  ({ id, name: id, artist: '', albumId, albumName: '', duration, indexNumber: 1 });
// Two tracks of album A, then one of album B.
const queue = [track('a1', 'A'), track('a2', 'A', 200), track('b1', 'B')];
const NOW = 1_000_000;

describe('sleepRemaining', () => {
  it('counts down to the deadline in minutes mode, never below zero', () => {
    const timer: SleepTimer = { mode: 'minutes', endsAt: NOW + 90_000, armedIndex: 0 };
    expect(sleepRemaining(timer, { now: NOW, queue, currentIndex: 0, currentTime: 0, duration: 100 })).toBe(90);
    expect(sleepRemaining(timer, { now: NOW + 100_000, queue, currentIndex: 0, currentTime: 0, duration: 100 })).toBe(0);
  });

  it('is the rest of the track at the end of a track', () => {
    const timer: SleepTimer = { mode: 'endOfTrack', armedIndex: 0 };
    expect(sleepRemaining(timer, { now: NOW, queue, currentIndex: 0, currentTime: 30, duration: 100 })).toBe(70);
  });

  it('adds the following tracks of the same album', () => {
    const timer: SleepTimer = { mode: 'endOfAlbum', armedIndex: 0 };
    expect(sleepRemaining(timer, { now: NOW, queue, currentIndex: 0, currentTime: 30, duration: 100 })).toBe(270);
  });

  it('is only the rest of the track when it is the last of the queue', () => {
    const timer: SleepTimer = { mode: 'endOfAlbum', armedIndex: 2 };
    expect(sleepRemaining(timer, { now: NOW, queue, currentIndex: 2, currentTime: 40, duration: 100 })).toBe(60);
  });
});

describe('sleepShouldPause', () => {
  it('pauses at the deadline', () => {
    const timer: SleepTimer = { mode: 'minutes', endsAt: NOW, armedIndex: 0 };
    expect(sleepShouldPause(timer, { now: NOW - 1, queue, currentIndex: 0 })).toBe(false);
    expect(sleepShouldPause(timer, { now: NOW, queue, currentIndex: 0 })).toBe(true);
  });

  it('pauses once another track plays at the end of a track', () => {
    const timer: SleepTimer = { mode: 'endOfTrack', armedIndex: 0 };
    expect(sleepShouldPause(timer, { now: NOW, queue, currentIndex: 0 })).toBe(false);
    expect(sleepShouldPause(timer, { now: NOW, queue, currentIndex: 1 })).toBe(true);
  });

  it('pauses once another album plays at the end of an album', () => {
    const timer: SleepTimer = { mode: 'endOfAlbum', armedIndex: 0 };
    expect(sleepShouldPause(timer, { now: NOW, queue, currentIndex: 1 })).toBe(false);
    expect(sleepShouldPause(timer, { now: NOW, queue, currentIndex: 2 })).toBe(true);
  });
});
