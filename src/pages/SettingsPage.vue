<template>
  <div class="min-h-dvh bg-surface text-text-body">
    <div class="max-w-2xl mx-auto px-4 py-8">
      <h1 class="text-xl font-bold text-text-heading mb-6">Settings</h1>
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
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePreferencesStore } from '@/store/preferences-store';

const preferencesStore = usePreferencesStore();

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
</script>
