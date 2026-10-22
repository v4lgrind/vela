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

/**
 * Tab routes own their section; detail routes keep the section stored on their history
 * entry (set when first opened), else inherit the tab they were opened from.
 */
export function resolveNavSection(
  routeName: string | undefined,
  previous: NavSection | null,
  stored?: NavSection,
): NavSection {
  return (routeName && TAB_ROUTES[routeName]) || stored || previous || 'home';
}

// Shared across the app so every consumer agrees on the section we came from.
const lastTab = ref<NavSection | null>(null);
const current = ref<NavSection>('home');

export function useNavSection(): ComputedRef<NavSection> {
  const route = useRoute();
  watch(
    () => route.fullPath,
    () => {
      const stored = window.history.state?.navSection as NavSection | undefined;
      current.value = resolveNavSection(route.name?.toString(), lastTab.value, stored);
      lastTab.value = current.value;
      // Remember it on this history entry so going back here restores the same tab.
      if (stored !== current.value) {
        window.history.replaceState({ ...window.history.state, navSection: current.value }, '');
      }
    },
    { immediate: true },
  );
  return computed(() => current.value);
}
