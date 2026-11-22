const TICKS_PER_MS = 10_000;

/** Jellyfin counts time in 100 ns ticks. */
export function ticksToMs(ticks: number | null | undefined): number | undefined {
  return ticks == null ? undefined : Math.round(ticks / TICKS_PER_MS);
}

export function msToTicks(ms: number): number {
  return Math.round(ms * TICKS_PER_MS);
}

/** SDK fields are `T | null | undefined`; the domain only uses `undefined`. */
export function opt<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

export function list<T>(value: T[] | null | undefined): T[] {
  return value ?? [];
}
