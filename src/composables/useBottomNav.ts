import { computed } from "vue";
import { useRoute } from "vue-router";
import { useJellyfinStore } from "@/store/jellyfin-store";
import { useAudioPlayerStore } from "@/store/audio-player-store";

// Single source of truth for whether the bottom navigation is on screen.
// Shared by App.vue (renders the nav) and MiniAudioPlayer.vue (stacks above it).
export function useBottomNavVisible() {
  const route = useRoute();
  const store = useJellyfinStore();
  const audioStore = useAudioPlayerStore();
  return computed(
    () =>
      store.isAuthenticated &&
      !audioStore.isExpanded &&
      route.name !== "login" &&
      route.name !== "Player",
  );
}
