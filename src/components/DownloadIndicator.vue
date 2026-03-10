<template>
  <!-- Floating download indicator -->
  <div v-if="downloadStore.hasActiveDownloads || showPanel" class="fixed bottom-20 right-4 z-50">
    <!-- Collapsed: small badge -->
    <button
      v-if="!showPanel && downloadStore.hasActiveDownloads"
      @click="showPanel = true"
      class="flex items-center gap-2 px-3 py-2 bg-accent-purple rounded-full shadow-lg shadow-black/30 text-white text-sm font-medium animate-pulse"
    >
      <Loader2 class="size-4 animate-spin" />
      <span>{{ downloadStore.activeDownloads.length }}</span>
      <span class="hidden sm:inline">downloading</span>
    </button>

    <!-- Expanded panel -->
    <div
      v-if="showPanel"
      class="w-72 bg-zinc-900 border border-white/10 rounded-xl shadow-xl shadow-black/40 overflow-hidden"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span class="text-sm font-semibold text-white">Downloads</span>
        <button @click="showPanel = false" class="text-white/60 hover:text-white">
          <X class="size-4" />
        </button>
      </div>

      <!-- Download list -->
      <div class="max-h-64 overflow-y-auto">
        <div
          v-for="task in allTasks"
          :key="task.itemId"
          class="px-4 py-3 border-b border-white/5 last:border-0"
        >
          <div class="flex items-start justify-between gap-2 mb-1">
            <span class="text-sm text-white truncate flex-1">{{ task.name }}</span>
            <button
              v-if="task.status === 'downloading'"
              @click="downloadStore.cancelDownload(task.itemId)"
              class="text-red-400 hover:text-red-300"
            >
              <X class="size-3.5" />
            </button>
            <Check v-else-if="task.status === 'completed'" class="size-3.5 text-green-400" />
            <AlertCircle v-else-if="task.status === 'failed'" class="size-3.5 text-red-400" />
          </div>

          <!-- Progress bar -->
          <div v-if="task.status === 'downloading'" class="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              class="h-full bg-accent-purple transition-all duration-300"
              :style="{ width: `${task.progress}%` }"
            />
          </div>

          <!-- Status text -->
          <div class="flex items-center justify-between mt-1">
            <span class="text-xs text-white/50">
              <template v-if="task.status === 'downloading'">
                {{ formatBytes(task.loaded) }} / {{ formatBytes(task.total) }}
              </template>
              <template v-else-if="task.status === 'completed'">Completed</template>
              <template v-else-if="task.status === 'failed'">{{ task.error || 'Failed' }}</template>
              <template v-else-if="task.status === 'cancelled'">Cancelled</template>
            </span>
            <span v-if="task.status === 'downloading'" class="text-xs text-accent-purple font-medium">
              {{ task.progress }}%
            </span>
          </div>
        </div>

        <div v-if="allTasks.length === 0" class="px-4 py-6 text-center text-white/40 text-sm">
          No downloads
        </div>
      </div>

      <!-- Footer -->
      <div v-if="downloadStore.completedDownloads.length > 0" class="px-4 py-2 border-t border-white/10">
        <button
          @click="downloadStore.clearCompleted()"
          class="text-xs text-white/50 hover:text-white/70"
        >
          Clear completed
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDownloadStore } from '@/store/download-store';
import { formatBytes } from '@/utils/helpers';
import { X, Check, AlertCircle, Loader2 } from 'lucide-vue-next';

const downloadStore = useDownloadStore();
const showPanel = ref(false);

const allTasks = computed(() => {
  return Array.from(downloadStore.tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
});
</script>
