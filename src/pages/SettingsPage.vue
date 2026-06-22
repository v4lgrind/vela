<template>
  <div class="min-h-dvh bg-background text-text-body">
    <div class="max-w-2xl mx-auto px-5 pt-6 pb-4">
      <h1 class="text-2xl font-bold text-text-heading tracking-tight mb-7">Settings</h1>

      <!-- Account -->
      <section class="mb-7">
        <p class="settings-label">Account</p>
        <div class="settings-card divide-y divide-border-default">
          <div class="flex items-center gap-3 px-4 py-3.5">
            <span class="size-10 shrink-0 rounded-full bg-gradient-to-br from-accent-purple to-[#0a4f8a]" />
            <div class="flex-1 min-w-0">
              <div class="text-[14.5px] font-semibold text-text-heading truncate">{{ currentServerName }}</div>
              <p class="text-xs text-text-muted mt-0.5 truncate">{{ jellyfinStore.serverUrl }}</p>
            </div>
            <span class="text-xs font-semibold text-accent-purple">Active</span>
          </div>
          <button class="settings-row" @click="router.push('/login')">
            <Server class="size-[19px] text-text-muted shrink-0" :stroke-width="1.8" />
            <span class="flex-1 text-[14.5px] text-text-heading">Switch Server</span>
            <ChevronRight class="size-[17px] text-text-muted" />
          </button>
          <button class="settings-row" @click="signOut">
            <LogOut class="size-[19px] text-error shrink-0" :stroke-width="1.8" />
            <span class="flex-1 text-[14.5px] font-medium text-error">Sign Out</span>
          </button>
        </div>
      </section>

      <!-- Appearance -->
      <section class="mb-7">
        <p class="settings-label">Appearance <span class="text-accent-purple font-bold">· new</span></p>
        <div class="settings-card p-4">
          <div class="flex items-center gap-3 mb-3.5">
            <Palette class="size-[19px] text-text-muted" :stroke-width="1.8" />
            <span class="text-[14.5px] font-medium text-text-heading">Theme</span>
          </div>
          <div class="flex gap-1.5 p-1 bg-surface-hover rounded-xl">
            <button
              v-for="opt in themeOptions" :key="opt.value"
              class="flex-1 py-2 rounded-lg text-[12.5px] font-semibold transition-colors"
              :class="preferencesStore.colorScheme === opt.value
                ? 'bg-accent-purple text-accent-ink'
                : 'text-text-primary'"
              @click="preferencesStore.colorScheme = opt.value">
              {{ opt.label }}
            </button>
          </div>
          <p class="text-[11.5px] text-text-muted mt-2.5 leading-relaxed">“Auto” follows your Android system display mode.</p>
        </div>
      </section>

      <!-- Language Preferences -->
      <section class="mb-7">
        <p class="settings-label">Language Preferences</p>
        <p class="settings-sub">Applied to all new items. Per-item overrides take precedence.</p>
        <div class="settings-card divide-y divide-border-default">
          <label class="settings-row">
            <span class="flex-1 text-[14.5px] text-text-heading">Audio Language</span>
            <select v-model="preferencesStore.preferredAudioLanguage" class="settings-select">
              <option v-for="lang in LANGUAGES" :key="lang.code" :value="lang.code">{{ lang.label }}</option>
            </select>
            <ChevronRight class="size-[17px] text-text-muted shrink-0" />
          </label>
          <label class="settings-row">
            <span class="flex-1 text-[14.5px] text-text-heading">Subtitle Language</span>
            <select v-model="preferencesStore.preferredSubtitleLanguage" class="settings-select">
              <option v-for="lang in SUBTITLE_LANGUAGES" :key="lang.code" :value="lang.code">{{ lang.label }}</option>
            </select>
            <ChevronRight class="size-[17px] text-text-muted shrink-0" />
          </label>
          <label class="settings-row">
            <span class="flex-1 text-[14.5px] text-text-heading">Subtitle Size</span>
            <select v-model.number="preferencesStore.subtitleSize" class="settings-select">
              <option v-for="s in SUBTITLE_SIZES" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
            <ChevronRight class="size-[17px] text-text-muted shrink-0" />
          </label>
          <!-- Subtitle size preview -->
          <div class="p-3.5">
            <div class="rounded-xl overflow-hidden relative flex items-end justify-center" style="height: 88px;">
              <div class="absolute inset-0 bg-gradient-to-br from-[#3b3b42] to-[#0b0b0e]" />
              <p
                class="relative text-white text-center leading-snug px-3 pb-2.5 font-semibold subtitle-preview-text"
                :style="{ fontSize: `${Math.round(15 * preferencesStore.subtitleSize)}px` }"
              >
                The quick brown fox jumps over the lazy dog
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Playback -->
      <section class="mb-7">
        <p class="settings-label">Playback</p>
        <p class="settings-sub">Default quality for all streams. Can be overridden per-item in the player.</p>
        <div class="settings-card">
          <label class="settings-row">
            <MonitorPlay class="size-[19px] text-text-muted shrink-0" :stroke-width="1.8" />
            <span class="flex-1 text-[14.5px] text-text-heading">Max Resolution</span>
            <select v-model.number="preferencesStore.preferredBitrate" class="settings-select">
              <option v-for="q in QUALITY_PRESETS" :key="q.bitrate" :value="q.bitrate">{{ q.label }}</option>
            </select>
            <ChevronRight class="size-[17px] text-text-muted shrink-0" />
          </label>
        </div>
      </section>

      <!-- Connectivity -->
      <section class="mb-7">
        <p class="settings-label">Connectivity</p>
        <div class="settings-card">
          <div class="flex items-center gap-3 px-4 py-3.5">
            <div class="flex-1">
              <div class="text-[14.5px] text-text-heading">Force Offline Mode</div>
              <p class="text-[11.5px] text-text-muted mt-0.5">Disable all Jellyfin network requests</p>
            </div>
            <button
              role="switch"
              :aria-checked="preferencesStore.forceOfflineMode"
              @click="preferencesStore.forceOfflineMode = !preferencesStore.forceOfflineMode"
              :class="preferencesStore.forceOfflineMode ? 'bg-accent-purple' : 'bg-surface-hover border border-border-default'"
              class="relative inline-flex h-[27px] w-[46px] shrink-0 items-center rounded-full transition-colors focus:outline-none"
            >
              <span
                :class="preferencesStore.forceOfflineMode ? 'translate-x-[22px] bg-white' : 'translate-x-[3px] bg-text-subtle'"
                class="inline-block size-[21px] rounded-full transition-transform"
              />
            </button>
          </div>
        </div>
      </section>

      <!-- Diagnostics -->
      <section class="mb-2">
        <p class="settings-label">Diagnostics</p>
        <div class="settings-card">
          <router-link to="/logs" class="settings-row">
            <div class="flex-1">
              <div class="text-[14.5px] text-text-heading">Debug Logs</div>
              <p class="text-[11.5px] text-text-muted mt-0.5">View and export playback diagnostic logs</p>
            </div>
            <ChevronRight class="size-[17px] text-text-muted shrink-0" />
          </router-link>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight, LogOut, Server, Palette, MonitorPlay } from 'lucide-vue-next';
import { usePreferencesStore } from '@/store/preferences-store';
import { useJellyfinStore } from '@/store/jellyfin-store';

const router = useRouter();
const jellyfinStore = useJellyfinStore();
const preferencesStore = usePreferencesStore();

const themeOptions = [
  { value: 'system' as const, label: 'Auto' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
];

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
/* Settings list primitives — OLED card style, token-driven so they follow
   the dark/light theme automatically. */
.settings-label {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-subtle);
  margin: 0 4px 10px;
}
.settings-sub {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--color-text-muted);
  margin: -4px 4px 10px;
}
.settings-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border-default);
  border-radius: 16px;
  overflow: hidden;
}
.settings-row {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 15px 16px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.settings-row:hover {
  background: var(--color-surface-hover);
}
.settings-select {
  appearance: none;
  background: transparent;
  border: none;
  outline: none;
  cursor: pointer;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 13px;
  text-align: right;
  text-align-last: right;
  max-width: 60%;
}
.settings-select option {
  color: #000;
}

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
