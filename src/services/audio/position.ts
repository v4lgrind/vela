import type { EngineState } from './types';

/**
 * Position the reported track was left at, for its "stopped" report. With the
 * app hidden no position ticks arrive, so the last one seen can be minutes
 * old: the engine's own record of the transition wins when it is about that track.
 */
export function positionLeftAt(reportedTrackId: string, lastPosition: number, s: EngineState): number {
  if (!reportedTrackId || s.previousTrackId !== reportedTrackId) return lastPosition;
  return s.previousPosition ?? lastPosition;
}
