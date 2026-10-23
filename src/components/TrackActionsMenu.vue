<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button :aria-label="t('audio.more')" :class="cn('size-11 rounded-full flex items-center justify-center text-text-subtle hover:bg-white/10 cursor-pointer', triggerClass)" @click.stop>
        <EllipsisVertical class="size-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent align="end" :side-offset="4"
        class="z-300 min-w-44 rounded-xl border border-border-default bg-surface-raised p-1 shadow-xl">
        <DropdownMenuItem class="flex items-center gap-2.5 min-h-11 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none data-highlighted:bg-white/10 cursor-pointer"
          @select="emit('playNext')">
          <ListStart class="size-4" /> {{ t('audio.playNext') }}
        </DropdownMenuItem>
        <DropdownMenuItem class="flex items-center gap-2.5 min-h-11 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none data-highlighted:bg-white/10 cursor-pointer"
          @select="emit('addToQueue')">
          <ListPlus class="size-4" /> {{ t('audio.addToQueue') }}
        </DropdownMenuItem>
        <template v-if="track">
          <DropdownMenuItem v-if="isDownloaded" class="flex items-center gap-2.5 min-h-11 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none data-highlighted:bg-white/10 cursor-pointer" @select="removeDownload">
            <Trash2 class="size-4" /> {{ t('audio.removeDownload') }}
          </DropdownMenuItem>
          <DropdownMenuItem v-else-if="isDownloading" class="flex items-center gap-2.5 min-h-11 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none data-highlighted:bg-white/10 cursor-pointer" @select="downloadStore.cancelDownload(track.Id)">
            <X class="size-4" /> {{ t('audio.cancelDownload') }}
          </DropdownMenuItem>
          <DropdownMenuItem v-else class="flex items-center gap-2.5 min-h-11 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none data-highlighted:bg-white/10 cursor-pointer" @select="download">
            <Download class="size-4" /> {{ t('detail.download') }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui';
import { Download, EllipsisVertical, ListPlus, ListStart, Trash2, X } from 'lucide-vue-next';
import { computed } from 'vue';
import { useToast } from '@/composables/useToast';
import { cn } from '@/lib/utils';
import { downloadService } from '@/services/downloadService';
import { useDownloadStore } from '@/store/download-store';
import { useOfflineStore } from '@/store/offline-store';

const { t } = useI18n();
// track: the Jellyfin Audio item; when given, the menu also downloads it for offline play.
const props = defineProps<{ triggerClass?: string; track?: any }>();
const downloadStore = useDownloadStore();
const offlineStore = useOfflineStore();
const toast = useToast();

const isDownloaded = computed(() => !!props.track && offlineStore.isItemDownloaded(props.track.Id));
const isDownloading = computed(() => !!props.track && downloadStore.isDownloading(props.track.Id));

function download() {
  downloadStore.startDownload(props.track.Id, props.track).catch((error: any) => {
    if (error?.name !== 'AbortError') toast.showError(t('detail.downloadFailed'));
  });
}

async function removeDownload() {
  if (!confirm(t('detail.confirmDelete', { name: props.track.Name }))) return;
  try {
    await downloadService.deleteOfflineFile(props.track.Id);
    await offlineStore.removeDownload(props.track.Id);
  } catch {
    toast.showError(t('detail.deleteFailed'));
  }
}

const emit = defineEmits<{ playNext: []; addToQueue: [] }>();
</script>
