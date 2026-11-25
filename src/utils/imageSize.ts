import type { ImageSize } from '@/domain';

/** Beyond 3x the eye can't tell, and the files get heavy. */
const MAX_DENSITY = 3;
/** Longest edge ever requested: servers won't upscale past the original anyway. */
const MAX_EDGE = 1920;

/**
 * Turns a size in CSS pixels into the size in device pixels to ask the server for,
 * so artwork stays sharp on dense screens (foldables, tablets) instead of being upscaled.
 */
export function deviceImageSize(cssSize: ImageSize, devicePixelRatio = globalThis.devicePixelRatio ?? 1): ImageSize {
  const density = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_DENSITY);
  const longestEdge = Math.max(cssSize.width ?? 0, cssSize.height ?? 0);
  const scale = longestEdge ? Math.min(density, MAX_EDGE / longestEdge) : density;
  const scaled: ImageSize = {};
  if (cssSize.width) scaled.width = Math.round(cssSize.width * scale);
  if (cssSize.height) scaled.height = Math.round(cssSize.height * scale);
  return scaled;
}
