import { computed, ref, watch, type ComputedRef } from 'vue';
import { useRoute } from 'vue-router';

export type NavSection = 'home' | 'library' | 'search' | 'downloads' | 'settings';

const TAB_ROUTES: Record<string, NavSection> = {
  libraries: 'home',
  libraryList: 'library',
  libraryItem: 'library',
  search: 'search',
  offline: 'downloads',
  settings: 'settings',
  logs: 'settings',
};

/** Tab routes own their section; detail routes inherit the tab they were opened from. */
export function resolveNavSection(routeName: string | undefined, previous: NavSection | null): NavSection {
  return (routeName && TAB_ROUTES[routeName]) || previous || 'home';
}

// Shared across the app so every consumer agrees on the section we came from.
const lastTab = ref<NavSection | null>(null);

export function useNavSection(): ComputedRef<NavSection> {
  const route = useRoute();
  watch(
    () => route.name?.toString(),
    (name) => {
      if (name && TAB_ROUTES[name]) lastTab.value = TAB_ROUTES[name];
    },
    { immediate: true },
  );
  return computed(() => resolveNavSection(route.name?.toString(), lastTab.value));
}
