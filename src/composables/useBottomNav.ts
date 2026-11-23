import { computed } from "vue";
import { useRoute } from "vue-router";
import { useSessionStore } from "@/store/session-store";
import { useAudioPlayerStore } from "@/store/audio-player-store";

// Single source of truth for whether the bottom navigation is on screen.
// Shared by App.vue (renders the nav) and MiniAudioPlayer.vue (stacks above it).
export function useBottomNavVisible() {
  const route = useRoute();
  const session = useSessionStore();
  const audioStore = useAudioPlayerStore();
  return computed(
    () =>
      session.isAuthenticated &&
      !audioStore.isExpanded &&
      route.name !== "login" &&
      route.name !== "Player",
  );
}
