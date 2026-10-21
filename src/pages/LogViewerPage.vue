<template>
  <AppPage width="content" class="min-h-dvh bg-background pb-6 text-text-body">
      <PageHeader back :title="t('settings.debugLogs')" :subtitle="t('logs.entries', entries.length)" class="mb-4">
        <template #actions>
          <Button variant="secondary" size="sm" @click="copyLogs">{{ copied ? t('logs.copied') : t('logs.copyAll') }}</Button>
          <Button variant="destructive" size="sm" @click="handleClear">{{ t('logs.clear') }}</Button>
        </template>
      </PageHeader>

      <!-- Filters -->
      <ToggleGroup type="single" variant="outline" size="sm" :model-value="activeFilter" class="mb-4 justify-start gap-2"
        @update:model-value="(v) => v && (activeFilter = v as typeof activeFilter)">
        <ToggleGroupItem v-for="f in filters" :key="f.value" :value="f.value">{{ f.label === 'logs.all' ? t(f.label) : f.label }}</ToggleGroupItem>
      </ToggleGroup>

      <!-- Log entries -->
      <div v-if="filtered.length === 0" class="text-center py-16 text-text-muted text-sm">
        {{ t('logs.empty') }}
      </div>
      <div v-else class="rounded-xl border border-border-input overflow-hidden">
        <div class="max-h-[70vh] overflow-y-auto bg-surface-raised">
          <div
            v-for="(entry, i) in filtered" :key="i"
            class="px-3 py-1.5 text-xs font-mono border-b border-border-input/50 last:border-0"
            :class="entry.message.includes('ERROR') || entry.message.includes('FAILED') ? 'bg-red-500/5' : ''"
          >
            <span class="text-text-muted mr-2">{{ formatTime(entry.ts) }}</span>
            <span
              class="inline-block w-12 text-center mr-2 rounded text-[10px] font-semibold py-0.5"
              :class="entry.source === 'kotlin' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'"
            >{{ entry.source === 'kotlin' ? 'KT' : 'VUE' }}</span>
            <span class="text-text-heading break-all">{{ entry.message }}</span>
          </div>
        </div>
      </div>
  </AppPage>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { AppPage, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getLogEntries, clearLogs, dumpLogs } from '@/utils/debugLog';

const { t } = useI18n();
const entries = computed(() => getLogEntries());
const activeFilter = ref<'all' | 'vue' | 'kotlin'>('all');
const copied = ref(false);

const filters = [
  { label: 'logs.all', value: 'all' as const },
  { label: 'Vue', value: 'vue' as const },
  { label: 'Kotlin', value: 'kotlin' as const },
];

const filtered = computed(() => {
  if (activeFilter.value === 'all') return entries.value;
  return entries.value.filter(e => e.source === activeFilter.value);
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}

async function copyLogs() {
  const text = dumpLogs();
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    // Fallback for WebView where clipboard API may not work
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
}

function handleClear() {
  clearLogs();
}
</script>
