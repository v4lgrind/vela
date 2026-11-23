import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';

import type { Library, MediaItem } from '@/domain';

import { toLibrary, toMediaItem } from './mappers';

/**
 * Data saved before the multi-backend model (offline downloads, remembered
 * libraries) is in the Jellyfin wire format. Used until Phase 6 stores domain snapshots.
 */
export function decodeStoredItem(raw: unknown): MediaItem {
  return toMediaItem(raw as BaseItemDto);
}

export function decodeStoredLibrary(raw: unknown): Library {
  return toLibrary(raw as BaseItemDto);
}
