/** Shuffles `items`, putting the one at `keepIndex` first (if any). */
export function shuffleAround<T>(items: T[], keepIndex: number, random = Math.random): T[] {
  const rest = items.filter((_, i) => i !== keepIndex);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const kept = items[keepIndex];
  return kept === undefined ? rest : [kept, ...rest];
}

/** Moves one element, returning a new array. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

/** Where the playing track ends up after moving `from` to `to`. */
export function indexAfterMove(current: number, from: number, to: number): number {
  if (from === current) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
}

/** Library shuffle tops the queue up once this many tracks are left after the playing one. */
export const LIBRARY_SHUFFLE_REFILL_AT = 5;

/**
 * Random picks not queued yet; all of them when every one was (a small
 * library has been fully played, so a new round starts).
 */
export function freshTracks<T extends { id: string }>(queue: T[], candidates: T[]): T[] {
  const queued = new Set(queue.map((t) => t.id));
  const fresh = candidates.filter((t) => !queued.has(t.id));
  return fresh.length ? fresh : candidates;
}

/** A radio queue: the seed track first, then the mix without it. */
export function radioQueue<T extends { id: string }>(seed: T | null, mix: T[]): T[] {
  if (!seed) return mix;
  return [seed, ...mix.filter((t) => t.id !== seed.id)];
}
