<template>
  <!-- Wide screens (tablet landscape, desktop): vertical rail on the left. -->
  <nav
    v-if="wide"
    class="fixed inset-y-0 left-0 z-40 flex w-[88px] flex-col items-center gap-2 border-r border-border-default
           bg-nav-bg pt-[calc(var(--sat,env(safe-area-inset-top,0px))+16px)] backdrop-blur-xl">
    <RouterLink
      v-for="tab in tabs" :key="tab.section"
      :to="{ name: tab.route }"
      :aria-current="section === tab.section ? 'page' : undefined"
      class="flex w-[72px] flex-col items-center gap-1 rounded-2xl py-2.5 text-label font-medium transition-colors"
      :class="section === tab.section ? 'bg-accent-purple/12 text-accent-purple' : 'text-text-subtle'">
      <component :is="tab.icon" class="size-6" :stroke-width="1.8" />
      {{ t(tab.label) }}
    </RouterLink>
  </nav>
  <!-- Phones and portrait tablets: floating bottom bar. -->
  <nav
    v-else
    class="fixed left-3 right-3 z-40 flex h-[66px] items-center rounded-[25px] border border-border-default
           bg-nav-bg px-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)] backdrop-blur-xl"
    :style="barStyle">
    <RouterLink
      v-for="tab in tabs" :key="tab.section"
      :to="{ name: tab.route }"
      :aria-current="section === tab.section ? 'page' : undefined"
      class="flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-1 text-label font-medium transition-colors"
      :class="section === tab.section ? 'text-accent-purple' : 'text-text-subtle'">
      <component :is="tab.icon" class="size-[22px]" :stroke-width="1.8" />
      <span class="max-w-full truncate">{{ t(tab.label) }}</span>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { Download, Home, LibraryBig, Search, Settings } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

import { useNavSection, type NavSection } from "@/composables/useNavSection";
import { useWideLayout } from "@/composables/useWideLayout";

const { t } = useI18n();
const section = useNavSection();
const wide = useWideLayout();

const tabs: { section: NavSection; label: string; route: string; icon: typeof Home }[] = [
  { section: "home", label: "nav.home", route: "libraries", icon: Home },
  { section: "library", label: "nav.library", route: "libraryList", icon: LibraryBig },
  { section: "search", label: "nav.search", route: "search", icon: Search },
  { section: "downloads", label: "nav.downloads", route: "offline", icon: Download },
  { section: "settings", label: "nav.settings", route: "settings", icon: Settings },
];

// Float above the gesture bar; --sab is the measured inset, env() is the web fallback.
const barStyle = { bottom: "calc(16px + var(--sab, env(safe-area-inset-bottom, 0px)))" };
</script>
