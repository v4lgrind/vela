import { computed } from 'vue';
import type { ComputedRef } from 'vue';

import type { ImageRef, ImageSize, MediaBackend } from '@/domain';
import { useSessionStore } from '@/store/session-store';
import { deviceImageSize } from '@/utils/imageSize';

/** The signed-in server. Throws when used without a session (pages behind the auth guard). */
export function useBackend(): ComputedRef<MediaBackend> {
  const session = useSessionStore();
  return computed(() => {
    if (!session.backend) throw new Error('No signed-in server');
    return session.backend;
  });
}

/**
 * Image URL for a ref, or '' (LazyImg then shows its placeholder).
 * `size` is the rendered size in CSS pixels; it is scaled to the screen density
 * so artwork stays sharp on dense screens (foldables, tablets).
 */
export function useImageUrl(): (ref: ImageRef | undefined, size?: ImageSize) => string {
  const session = useSessionStore();
  return (ref, size) => (ref && session.backend ? session.backend.imageUrl(ref, size && deviceImageSize(size)) : '');
}
