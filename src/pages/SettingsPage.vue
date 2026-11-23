<template>
  <AppPage width="content" class="min-h-dvh bg-background pb-6 text-text-body">
      <PageHeader :title="t('settings.title')" class="mb-5" />

      <!-- Account -->
      <section class="mb-7">
        <p class="settings-label">{{ t('settings.account') }}</p>
        <div class="settings-card divide-y divide-border-default">
          <div class="flex items-center gap-3 px-4 py-3.5">
            <span class="size-10 shrink-0 rounded-full bg-gradient-to-br from-accent-purple to-[#0a4f8a]" />
            <div class="flex-1 min-w-0">
              <div class="text-[14.5px] font-semibold text-text-heading truncate">{{ currentServerName }}</div>
              <p class="text-xs text-text-muted mt-0.5 truncate">{{ session.active?.baseUrl }}</p>
            </div>
            <span class="text-xs font-semibold text-accent-purple">{{ t('settings.active') }}</span>
          </div>
          <ListRow v-if="session.active?.accountKey" :icon="Users" :label="t('settings.switchProfile')"
            :to="{ name: 'login', query: { switch: 'profile' } }" />
          <ListRow :icon="Server" :label="t('settings.switchServer')" :to="{ name: 'login', query: { switch: 'server' } }" />
          <ListRow :icon="LogOut" :label="t('settings.signOut')" destructive @click="signOut" />
        </div>
      </section>

      <!-- Appearance -->
      <section class="mb-7">
        <p class="settings-label">{{ t('settings.appearance') }}</p>
        <div class="settings-card p-4">
          <div class="flex items-center gap-3 mb-3.5">
            <Palette class="size-[19px] text-text-muted" :stroke-width="1.8" />
            <span class="text-body font-medium text-text-heading">{{ t('settings.theme') }}</span>
          </div>
          <ToggleGroup type="single" variant="outline" :model-value="preferencesStore.colorScheme" class="grid grid-cols-3 gap-2"
            @update:model-value="(v) => v && (preferencesStore.colorScheme = v as typeof preferencesStore.colorScheme)">
            <ToggleGroupItem v-for="opt in themeOptions" :key="opt.value" :value="opt.value">
              {{ t(opt.label) }}
            </ToggleGroupItem>
          </ToggleGroup>
          <p class="text-caption text-text-muted mt-2.5 leading-relaxed">{{ t('settings.themeHint') }}</p>
        </div>
      </section>

      <!-- Language Preferences -->
      <section class="mb-7">
        <p class="settings-label">{{ t('settings.languages') }}</p>
        <p class="settings-sub">{{ t('settings.languagesHint') }}</p>
        <div class="settings-card divide-y divide-border-default">
          <label class="settings-row">
            <span class="flex-1 text-body text-text-heading">{{ t('settings.audioLanguage') }}</span>
            <select v-model="preferencesStore.preferredAudioLanguage" class="settings-select">
              <option v-for="lang in LANGUAGES" :key="lang.code" :value="lang.code">{{ t(lang.label) }}</option>
            </select>
            <ChevronRight class="size-[17px] text-text-muted shrink-0" />
          </label>
          <label class="settings-row">
            <span class="flex-1 text-body text-text-heading">{{ t('settings.subtitleLanguage') }}</span>
            <select v-model="preferencesStore.preferredSubtitleLanguage" class="settings-select">
              <option v-for="lang in SUBTITLE_LANGUAGES" :key="lang.code" :value="lang.code">{{ t(lang.label) }}</option>
            </select>
            <ChevronRight class="size-[17px] text-text-muted shrink-0" />
          </label>
          <label class="settings-row">
            <span class="flex-1 text-body text-text-heading">{{ t('settings.subtitleSize') }}</span>
            <select v-model.number="preferencesStore.subtitleSize" class="settings-select">
              <option v-for="s in SUBTITLE_SIZES" :key="s.value" :value="s.value">{{ t(s.label) }}</option>
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
                {{ t('settings.subtitlePreview') }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Playback -->
      <section class="mb-7">
        <p class="settings-label">{{ t('settings.playback') }}</p>
        <p class="settings-sub">{{ t('settings.playbackHint') }}</p>
        <div class="settings-card">
          <label class="settings-row">
            <MonitorPlay class="size-[19px] text-text-muted shrink-0" :stroke-width="1.8" />
            <span class="flex-1 text-body text-text-heading">{{ t('settings.maxResolution') }}</span>
            <select v-model.number="preferencesStore.preferredBitrate" class="settings-select">
              <option v-for="q in QUALITY_PRESETS" :key="q.bitrate" :value="q.bitrate">{{ q.label.startsWith('settings.') ? t(q.label) : q.label }}</option>
            </select>
            <ChevronRight class="size-[17px] text-text-muted shrink-0" />
          </label>
          <label class="settings-row">
            <Music class="size-[19px] text-text-muted shrink-0" :stroke-width="1.8" />
            <span class="flex-1 text-body text-text-heading">{{ t('settings.musicQuality') }}</span>
            <select v-model.number="preferencesStore.musicMaxBitrate" class="settings-select">
              <option v-for="q in MUSIC_QUALITY_PRESETS" :key="q.bitrate" :value="q.bitrate">{{ q.label.startsWith('settings.') ? t(q.label) : q.label }}</option>
            </select>
            <ChevronRight class="size-[17px] text-text-muted shrink-0" />
          </label>
        </div>
      </section>

      <!-- Connectivity -->
      <section class="mb-7">
        <p class="settings-label">{{ t('settings.connectivity') }}</p>
        <div class="settings-card">
          <label class="flex min-h-12 items-center gap-3 px-4 py-3.5">
            <div class="flex-1">
              <div class="text-body text-text-heading">{{ t('settings.forceOffline') }}</div>
              <p class="text-caption text-text-muted mt-0.5">{{ t('settings.forceOfflineHint') }}</p>
            </div>
            <Switch v-model="preferencesStore.forceOfflineMode" />
          </label>
        </div>
      </section>

      <!-- Diagnostics -->
      <section class="mb-2">
        <p class="settings-label">{{ t('settings.diagnostics') }}</p>
        <div class="settings-card">
          <router-link to="/logs" class="settings-row">
            <div class="flex-1">
              <div class="text-body text-text-heading">{{ t('settings.debugLogs') }}</div>
              <p class="text-caption text-text-muted mt-0.5">{{ t('settings.debugLogsHint') }}</p>
            </div>
            <ChevronRight class="size-[17px] text-text-muted shrink-0" />
          </router-link>
        </div>
      </section>
  </AppPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AppPage, ListRow, PageHeader } from '@/components/layout';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChevronRight, LogOut, Server, Palette, MonitorPlay, Music, Users } from 'lucide-vue-next';
import { usePreferencesStore } from '@/store/preferences-store';
import { useSessionStore } from '@/store/session-store';

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const preferencesStore = usePreferencesStore();

const themeOptions = [
  { value: 'system' as const, label: 'settings.themeAuto' },
  { value: 'light' as const, label: 'settings.themeLight' },
  { value: 'dark' as const, label: 'settings.themeDark' },
];

const currentServerName = computed(() => session.active?.serverName ?? '');

function signOut() {
  session.signOut();
  router.push({ name: 'login' });
}

const LANGUAGES = [
  { code: '',    label: 'settings.lang.none' },
  { code: 'eng', label: 'settings.lang.eng' },
  { code: 'fra', label: 'settings.lang.fra' },
  { code: 'spa', label: 'settings.lang.spa' },
  { code: 'deu', label: 'settings.lang.deu' },
  { code: 'ita', label: 'settings.lang.ita' },
  { code: 'jpn', label: 'settings.lang.jpn' },
  { code: 'kor', label: 'settings.lang.kor' },
  { code: 'por', label: 'settings.lang.por' },
  { code: 'rus', label: 'settings.lang.rus' },
  { code: 'zho', label: 'settings.lang.zho' },
  { code: 'ara', label: 'settings.lang.ara' },
];

const SUBTITLE_LANGUAGES = [
  { code: '',    label: 'settings.lang.off' },
  ...LANGUAGES.slice(1),
];

const SUBTITLE_SIZES = [
  { value: 0.75, label: 'settings.size.small' },
  { value: 1.0,  label: 'settings.size.normal' },
  { value: 1.25, label: 'settings.size.large' },
  { value: 1.5,  label: 'settings.size.xl' },
  { value: 2.0,  label: 'settings.size.huge' },
];

const QUALITY_PRESETS = [
  { bitrate: 0,          label: 'settings.themeAuto' },
  { bitrate: 80_000_000, label: '4K' },
  { bitrate: 20_000_000, label: '1080p' },
  { bitrate:  8_000_000, label: '720p' },
  { bitrate:  3_000_000, label: '480p' },
  { bitrate:  1_500_000, label: '360p' },
];

// Above the limit (e.g. FLAC on a 320 kbps cap) the server transcodes to MP3.
const MUSIC_QUALITY_PRESETS = [
  { bitrate: 0,       label: 'settings.original' },
  { bitrate: 320_000, label: '320 kbps' },
  { bitrate: 192_000, label: '192 kbps' },
  { bitrate: 128_000, label: '128 kbps' },
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
