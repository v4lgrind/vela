import { computed } from 'vue';
import type { ComputedRef } from 'vue';

import type { ImageRef, ImageSize, MediaBackend } from '@/domain';
import { useSessionStore } from '@/store/session-store';

/** The signed-in server. Throws when used without a session (pages behind the auth guard). */
export function useBackend(): ComputedRef<MediaBackend> {
  const session = useSessionStore();
  return computed(() => {
    if (!session.backend) throw new Error('No signed-in server');
    return session.backend;
  });
}

/** Image URL for a ref, or '' (LazyImg then shows its placeholder). */
export function useImageUrl(): (ref: ImageRef | undefined, size?: ImageSize) => string {
  const session = useSessionStore();
  return (ref, size) => (ref && session.backend ? session.backend.imageUrl(ref, size) : '');
}
