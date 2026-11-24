import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';

import type { ImageRef, ImageSize, Images } from '@/domain';

type JellyfinImageType = 'Primary' | 'Backdrop' | 'Thumb' | 'Logo';

const SEPARATOR = '/';
const IMAGE_QUALITY = '80';

/** ImageRef format (private to this backend): `<itemId>/<imageType>/<tag>`. */
export function jellyfinImageRef(itemId: string | null | undefined, type: JellyfinImageType, tag: string | null | undefined): ImageRef | undefined {
  if (!itemId || !tag) return undefined;
  return [itemId, type, tag].join(SEPARATOR);
}

export function jellyfinImageUrl(serverUrl: string, ref: ImageRef, size: ImageSize = {}): string {
  const [itemId, type, tag] = ref.split(SEPARATOR);
  const params = new URLSearchParams({ tag, quality: IMAGE_QUALITY });
  if (size.width) params.set('maxWidth', String(size.width));
  if (size.height) params.set('maxHeight', String(size.height));
  return `${serverUrl}/Items/${encodeURIComponent(itemId)}/Images/${type}?${params}`;
}

function ownImage(dto: BaseItemDto, type: JellyfinImageType): ImageRef | undefined {
  return jellyfinImageRef(dto.Id, type, dto.ImageTags?.[type]);
}

function ownBackdrop(dto: BaseItemDto): ImageRef | undefined {
  return jellyfinImageRef(dto.Id, 'Backdrop', dto.BackdropImageTags?.[0]);
}

function parentBackdrop(dto: BaseItemDto): ImageRef | undefined {
  return jellyfinImageRef(dto.ParentBackdropItemId, 'Backdrop', dto.ParentBackdropImageTags?.[0]);
}

function parentLogo(dto: BaseItemDto): ImageRef | undefined {
  return jellyfinImageRef(dto.ParentLogoItemId, 'Logo', dto.ParentLogoImageTag);
}

function seriesPoster(dto: BaseItemDto): ImageRef | undefined {
  return jellyfinImageRef(dto.SeriesId, 'Primary', dto.SeriesPrimaryImageTag);
}

function episodeImages(dto: BaseItemDto): Images {
  return {
    poster: seriesPoster(dto) ?? ownImage(dto, 'Primary'),
    thumb: ownImage(dto, 'Primary'),
    backdrop: parentBackdrop(dto) ?? ownBackdrop(dto),
    logo: parentLogo(dto),
  };
}

function seasonImages(dto: BaseItemDto): Images {
  return {
    poster: ownImage(dto, 'Primary') ?? seriesPoster(dto),
    backdrop: parentBackdrop(dto) ?? ownBackdrop(dto),
    logo: parentLogo(dto),
  };
}

function trackImages(dto: BaseItemDto): Images {
  return { poster: jellyfinImageRef(dto.AlbumId, 'Primary', dto.AlbumPrimaryImageTag) ?? ownImage(dto, 'Primary') };
}

function defaultImages(dto: BaseItemDto): Images {
  return {
    poster: ownImage(dto, 'Primary'),
    thumb: ownImage(dto, 'Thumb'),
    backdrop: ownBackdrop(dto) ?? parentBackdrop(dto),
    logo: ownImage(dto, 'Logo') ?? parentLogo(dto),
  };
}

const IMAGES_BY_TYPE: Record<string, (dto: BaseItemDto) => Images> = {
  Episode: episodeImages,
  Season: seasonImages,
  Audio: trackImages,
};

/** Images by role, with the parent fallbacks the UI relies on (series poster, series backdrop, album cover). */
export function itemImages(dto: BaseItemDto): Images {
  const images = (IMAGES_BY_TYPE[dto.Type ?? ''] ?? defaultImages)(dto);
  return Object.fromEntries(Object.entries(images).filter(([, ref]) => ref !== undefined)) as Images;
}
