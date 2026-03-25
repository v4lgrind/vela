<template>
  <div class="min-h-dvh bg-surface text-text-body">
    <div class="max-w-4xl mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <button @click="$router.back()" class="p-2 -ml-2 text-text-muted hover:text-text-heading">
            <ArrowLeft class="w-5 h-5" />
          </button>
          <h1 class="text-xl font-bold text-text-heading">Debug Logs</h1>
          <span class="text-xs text-text-muted">({{ entries.length }} entries)</span>
        </div>
        <div class="flex items-center gap-2">
          <button @click="copyLogs" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-border-input text-text-heading hover:bg-surface-hover">
            {{ copied ? 'Copied!' : 'Copy All' }}
          </button>
          <button @click="handleClear" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30">
            Clear
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex gap-2 mb-4">
        <button
          v-for="f in filters" :key="f.value"
          @click="activeFilter = f.value"
          :class="activeFilter === f.value ? 'bg-accent-purple text-white' : 'bg-surface-raised text-text-muted border border-border-input'"
          class="px-3 py-1 text-xs font-medium rounded-full"
        >{{ f.label }}</button>
      </div>

      <!-- Log entries -->
      <div v-if="filtered.length === 0" class="text-center py-16 text-text-muted text-sm">
        No log entries yet. Play media to generate diagnostic logs.
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ArrowLeft } from 'lucide-vue-next';
import { getLogEntries, clearLogs, dumpLogs } from '@/utils/debugLog';

const entries = computed(() => getLogEntries());
const activeFilter = ref<'all' | 'vue' | 'kotlin'>('all');
const copied = ref(false);

const filters = [
  { label: 'All', value: 'all' as const },
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
