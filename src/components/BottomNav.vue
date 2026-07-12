<template>
  <nav
    class="fixed left-3 right-3 z-40 h-[66px] flex items-center justify-around px-2
           rounded-[25px] border border-border-default bg-nav-bg backdrop-blur-xl
           shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)]"
    :style="navStyle">
    <RouterLink
      v-for="tab in tabs" :key="tab.name"
      :to="{ name: tab.route }"
      class="flex flex-col items-center gap-1 px-3 py-1 text-[9.5px] font-medium transition-colors"
      :class="isActive(tab) ? 'text-accent-purple' : 'text-text-subtle'">
      <component :is="tab.icon" class="size-[22px]" :stroke-width="1.8" />
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { Home, Search, Download, Settings } from "lucide-vue-next";

const route = useRoute();

const tabs = [
  { name: "home", label: "Accueil", route: "libraries", icon: Home, match: ["libraries", "libraryItem", "ItemDetails", "PersonDetail"] },
  { name: "search", label: "Recherche", route: "search", icon: Search, match: ["search"] },
  { name: "downloads", label: "Téléch.", route: "offline", icon: Download, match: ["offline"] },
  { name: "settings", label: "Réglages", route: "settings", icon: Settings, match: ["settings", "logs"] },
] as const;

function isActive(tab: (typeof tabs)[number]): boolean {
  return (tab.match as readonly string[]).includes(route.name as string);
}

// Float above the gesture bar; --sab is the measured inset, env() is the web fallback.
const navStyle = { bottom: "calc(16px + var(--sab, env(safe-area-inset-bottom, 0px)))" };
</script>
