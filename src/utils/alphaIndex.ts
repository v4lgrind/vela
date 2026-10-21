/** Letter under a finger at `offsetY` within an index strip of `height` px. */
export function letterAt(offsetY: number, height: number, letters: readonly string[]): string {
  const index = Math.floor((offsetY / height) * letters.length);
  return letters[Math.min(letters.length - 1, Math.max(0, index))];
}
