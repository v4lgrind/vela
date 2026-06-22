<template>
  <div class="min-h-dvh bg-background text-text-body">
    <div class="max-w-2xl mx-auto px-4 py-8">
      <h1 class="text-xl font-bold text-text-heading mb-6">Settings</h1>

      <!-- Account -->
      <section class="mb-8">
        <h2 class="text-base font-semibold text-text-heading mb-1">Account</h2>
        <p class="text-sm text-text-muted mb-4">Manage your Jellyfin servers and account.</p>
        <div class="flex flex-col gap-0 rounded-xl overflow-hidden border border-border-input divide-y divide-border-input">
          <div class="flex items-center justify-between px-4 py-3 bg-surface-raised">
            <div>
              <span class="text-sm font-medium text-text-heading">{{ currentServerName }}</span>
              <p class="text-xs text-text-muted mt-0.5">{{ jellyfinStore.serverUrl }}</p>
            </div>
            <span class="text-xs text-accent-purple font-medium">Active</span>
          </div>
          <button
            class="flex items-center justify-between px-4 py-3 bg-surface-raised hover:bg-surface-hover w-full text-left"
            @click="router.push('/login')"
          >
            <span class="text-sm font-medium text-text-heading">Switch Server</span>
            <ChevronRight class="w-4 h-4 text-text-muted" />
          </button>
          <button
            class="flex items-center justify-between px-4 py-3 bg-surface-raised hover:bg-surface-hover w-full text-left"
            @click="signOut"
          >
            <span class="text-sm font-medium text-red-400">Sign Out</span>
            <LogOut class="w-4 h-4 text-red-400" />
          </button>
        </div>
      </section>

      <section>
        <h2 class="text-base font-semibold text-text-heading mb-1">Language Preferences</h2>
        <p class="text-sm text-text-muted mb-4">Applied to all new items. Per-item overrides take precedence.</p>

        <div class="flex flex-col gap-0 rounded-xl overflow-hidden border border-border-input divide-y divide-border-input">
          <div class="flex items-center justify-between px-4 py-3 bg-surface-raised">
            <span class="text-sm font-medium text-text-heading">Audio Language</span>
            <select
              v-model="preferencesStore.preferredAudioLanguage"
              class="bg-surface-raised border border-border-input rounded-lg px-3 py-2 text-sm text-text-heading focus:outline-none focus:border-accent-purple w-48"
            >
              <option v-for="lang in LANGUAGES" :key="lang.code" :value="lang.code">{{ lang.label }}</option>
            </select>
          </div>
          <div class="flex items-center justify-between px-4 py-3 bg-surface-raised">
            <span class="text-sm font-medium text-text-heading">Subtitle Language</span>
            <select
              v-model="preferencesStore.preferredSubtitleLanguage"
              class="bg-surface-raised border border-border-input rounded-lg px-3 py-2 text-sm text-text-heading focus:outline-none focus:border-accent-purple w-48"
            >
              <option v-for="lang in SUBTITLE_LANGUAGES" :key="lang.code" :value="lang.code">{{ lang.label }}</option>
            </select>
          </div>
          <div class="flex items-center justify-between px-4 py-3 bg-surface-raised">
            <span class="text-sm font-medium text-text-heading">Subtitle Size</span>
            <select
              v-model.number="preferencesStore.subtitleSize"
              class="bg-surface-raised border border-border-input rounded-lg px-3 py-2 text-sm text-text-heading focus:outline-none focus:border-accent-purple w-48"
            >
              <option v-for="s in SUBTITLE_SIZES" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>
          <!-- Subtitle size preview -->
          <div class="px-4 py-3 bg-black/60">
            <div class="rounded-lg bg-black overflow-hidden relative flex items-end justify-center" style="height: 90px;">
              <!-- Simulated scene -->
              <div class="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
              <p
                class="relative text-white text-center leading-snug px-3 pb-2 font-medium subtitle-preview-text"
                :style="{ fontSize: `${Math.round(15 * preferencesStore.subtitleSize)}px` }"
              >
                The quick brown fox jumps over the lazy dog
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="mt-8">
        <h2 class="text-base font-semibold text-text-heading mb-1">Playback</h2>
        <p class="text-sm text-text-muted mb-4">Default quality for all streams. Can be overridden per-item in the player.</p>
        <div class="flex flex-col gap-0 rounded-xl overflow-hidden border border-border-input divide-y divide-border-input">
          <div class="flex items-center justify-between px-4 py-3 bg-surface-raised">
            <span class="text-sm font-medium text-text-heading">Max Resolution</span>
            <select
              v-model.number="preferencesStore.preferredBitrate"
              class="bg-surface-raised border border-border-input rounded-lg px-3 py-2 text-sm text-text-heading focus:outline-none focus:border-accent-purple w-48"
            >
              <option v-for="q in QUALITY_PRESETS" :key="q.bitrate" :value="q.bitrate">{{ q.label }}</option>
            </select>
          </div>
        </div>
      </section>

      <section class="mt-8">
        <h2 class="text-base font-semibold text-text-heading mb-1">Connectivity</h2>
        <p class="text-sm text-text-muted mb-4">Force the app to behave as if offline, using downloaded content only.</p>
        <div class="flex flex-col gap-0 rounded-xl overflow-hidden border border-border-input divide-y divide-border-input">
          <div class="flex items-center justify-between px-4 py-3 bg-surface-raised">
            <div>
              <span class="text-sm font-medium text-text-heading">Force Offline Mode</span>
              <p class="text-xs text-text-muted mt-0.5">Disable all Jellyfin network requests</p>
            </div>
            <button
              role="switch"
              :aria-checked="preferencesStore.forceOfflineMode"
              @click="preferencesStore.forceOfflineMode = !preferencesStore.forceOfflineMode"
              :class="preferencesStore.forceOfflineMode ? 'bg-accent-purple' : 'bg-border-default'"
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
            >
              <span
                :class="preferencesStore.forceOfflineMode ? 'translate-x-6' : 'translate-x-1'"
                class="inline-block h-4 w-4 rounded-full bg-white transition-transform"
              />
            </button>
          </div>
        </div>
      </section>
      <section class="mt-8">
        <h2 class="text-base font-semibold text-text-heading mb-1">Diagnostics</h2>
        <p class="text-sm text-text-muted mb-4">View player debug logs for troubleshooting playback issues.</p>
        <div class="flex flex-col gap-0 rounded-xl overflow-hidden border border-border-input divide-y divide-border-input">
          <router-link to="/logs" class="flex items-center justify-between px-4 py-3 bg-surface-raised hover:bg-surface-hover">
            <div>
              <span class="text-sm font-medium text-text-heading">Debug Logs</span>
              <p class="text-xs text-text-muted mt-0.5">View and export playback diagnostic logs</p>
            </div>
            <ChevronRight class="w-4 h-4 text-text-muted" />
          </router-link>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight, LogOut } from 'lucide-vue-next';
import { usePreferencesStore } from '@/store/preferences-store';
import { useJellyfinStore } from '@/store/jellyfin-store';

const router = useRouter();
const jellyfinStore = useJellyfinStore();
const preferencesStore = usePreferencesStore();

const currentServerName = computed(() => {
  const saved = jellyfinStore.savedServers.find(
    (s) => s.serverUrl === jellyfinStore.serverUrl && s.userId === jellyfinStore.userId
  );
  return saved?.serverName ?? new URL(jellyfinStore.serverUrl || 'http://unknown').hostname;
});

async function signOut() {
  await jellyfinStore.logout();
  router.push({ name: 'login' });
}

const LANGUAGES = [
  { code: '',    label: 'None – use default' },
  { code: 'eng', label: 'English' },
  { code: 'fra', label: 'French' },
  { code: 'spa', label: 'Spanish' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' },
  { code: 'por', label: 'Portuguese' },
  { code: 'rus', label: 'Russian' },
  { code: 'zho', label: 'Chinese' },
  { code: 'ara', label: 'Arabic' },
];

const SUBTITLE_LANGUAGES = [
  { code: '',    label: 'Off' },
  ...LANGUAGES.slice(1),
];

const SUBTITLE_SIZES = [
  { value: 0.75, label: 'Small' },
  { value: 1.0,  label: 'Normal' },
  { value: 1.25, label: 'Large' },
  { value: 1.5,  label: 'Extra Large' },
  { value: 2.0,  label: 'Huge' },
];

const QUALITY_PRESETS = [
  { bitrate: 0,          label: 'Auto' },
  { bitrate: 80_000_000, label: '4K' },
  { bitrate: 20_000_000, label: '1080p' },
  { bitrate:  8_000_000, label: '720p' },
  { bitrate:  3_000_000, label: '480p' },
  { bitrate:  1_500_000, label: '360p' },
];
</script>

<style scoped>
/* Mimics ExoPlayer's EDGE_TYPE_OUTLINE (black outline on white text) */
.subtitle-preview-text {
  text-shadow:
    -1px -1px 0 #000,
     1px -1px 0 #000,
    -1px  1px 0 #000,
     1px  1px 0 #000,
     0    0   4px #000;
  transition: font-size 0.2s ease;
}
</style>
