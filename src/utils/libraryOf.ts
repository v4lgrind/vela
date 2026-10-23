/**
 * The library (user view) holding an item, from its Jellyfin ancestors: the
 * first ancestor that is a known library, else its collection folder.
 */
export function pickLibraryId(
  ancestors: { Id?: string | null; Type?: string | null }[],
  libraryIds: string[],
): string | undefined {
  const known = ancestors.find((ancestor) => ancestor.Id && libraryIds.includes(ancestor.Id));
  return (known ?? ancestors.find((ancestor) => ancestor.Type === 'CollectionFolder'))?.Id ?? undefined;
}
