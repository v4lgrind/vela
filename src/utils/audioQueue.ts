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
