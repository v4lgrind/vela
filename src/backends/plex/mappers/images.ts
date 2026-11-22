import type { ImageRef, ImageSize, Images } from '@/domain';

import type { PlexMetadata } from '../types';

/**
 * ImageRef format (private to this backend): the Plex image path
 * (`/library/metadata/1/thumb/123`) or an absolute URL (people from metadata agents).
 */
export function plexImageUrl(serverUrl: string, token: string, ref: ImageRef, size: ImageSize = {}): string {
  const params = new URLSearchParams({ url: ref, minSize: '1', upscale: '1', 'X-Plex-Token': token });
  if (size.width) params.set('width', String(size.width));
  if (size.height) params.set('height', String(size.height));
  return `${serverUrl}/photo/:/transcode?${params}`;
}

function imageOfType(item: PlexMetadata, type: string): ImageRef | undefined {
  return item.Image?.find((image) => image.type === type)?.url;
}

function compact(images: Images): Images {
  return Object.fromEntries(Object.entries(images).filter(([, ref]) => ref)) as Images;
}

function episodeImages(item: PlexMetadata): Images {
  return {
    poster: item.grandparentThumb ?? item.parentThumb ?? item.thumb,
    thumb: item.thumb,
    backdrop: item.grandparentArt ?? item.art,
    logo: imageOfType(item, 'clearLogo'),
  };
}

function seasonImages(item: PlexMetadata): Images {
  return {
    poster: item.thumb ?? item.parentThumb,
    backdrop: item.art ?? item.grandparentArt,
    logo: imageOfType(item, 'clearLogo'),
  };
}

function trackImages(item: PlexMetadata): Images {
  return { poster: item.parentThumb ?? item.thumb };
}

function defaultImages(item: PlexMetadata): Images {
  return {
    poster: imageOfType(item, 'coverPoster') ?? item.thumb,
    backdrop: imageOfType(item, 'background') ?? item.art,
    logo: imageOfType(item, 'clearLogo'),
  };
}

const IMAGES_BY_TYPE: Record<string, (item: PlexMetadata) => Images> = {
  episode: episodeImages,
  season: seasonImages,
  track: trackImages,
};

export function itemImages(item: PlexMetadata): Images {
  return compact((IMAGES_BY_TYPE[item.type] ?? defaultImages)(item));
}
