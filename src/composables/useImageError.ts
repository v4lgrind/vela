import { useJellyfinStore } from '../store/jellyfin-store';

export function useImageError() {
  const store = useJellyfinStore();

  function handleImageError(e: Event, itemType: string) {
    const img = e.target as HTMLImageElement;
    img.src = store.getPlaceholderImage(itemType);
  }

  return { handleImageError };
}
