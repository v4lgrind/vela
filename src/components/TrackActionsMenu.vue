<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button :aria-label="t('audio.more')" :class="cn('size-11 rounded-full flex items-center justify-center text-text-subtle hover:bg-white/10 cursor-pointer', triggerClass)" @click.stop>
        <EllipsisVertical class="size-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent align="end" :side-offset="4"
        :class="MENU_CONTENT_CLASS">
        <template v-if="menuTarget && extraActions.length">
          <DropdownMenuItem v-for="action in extraActions" :key="musicActionKey(action)" :class="MENU_ITEM_CLASS"
            @select="run(action, menuTarget, track)">
            <component :is="musicActionView(action, t).icon" class="size-4 shrink-0" />
            <span class="truncate">{{ musicActionView(action, t).label }}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator class="my-1 h-px bg-border-default" />
        </template>
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
          <DropdownMenuItem v-else-if="isDownloading" class="flex items-center gap-2.5 min-h-11 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none data-highlighted:bg-white/10 cursor-pointer" @select="downloadStore.cancelDownload(trackId)">
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
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui';
import { Download, EllipsisVertical, ListPlus, ListStart, Trash2, X } from 'lucide-vue-next';
import { computed } from 'vue';
import { useMusicActions } from '@/composables/useMusicActions';
import { useToast } from '@/composables/useToast';
import { cn } from '@/lib/utils';
import { downloadService } from '@/services/downloadService';
import { useDownloadStore } from '@/store/download-store';
import { useOfflineStore } from '@/store/offline-store';
import type { Track } from '@/domain';
import { trackTarget } from '@/utils/musicActions';
import type { MusicTarget } from '@/utils/musicActions';
import { MENU_CONTENT_CLASS, MENU_ITEM_CLASS, musicActionKey, musicActionView } from './music/musicActionView';

const { t } = useI18n();
// track: when given, the menu also downloads it for offline play.
// target: the album (or track) the go-to / radio entries are about; defaults to the track.
const props = defineProps<{ triggerClass?: string; track?: Track; target?: MusicTarget }>();
const { actionsFor, run } = useMusicActions();
const menuTarget = computed(() => props.target ?? (props.track ? trackTarget(props.track) : undefined));
const extraActions = computed(() => (menuTarget.value ? actionsFor(menuTarget.value, { queueActions: false }) : []));
const trackId = computed(() => props.track?.id ?? '');
const trackName = computed(() => props.track?.title ?? '');
const downloadStore = useDownloadStore();
const offlineStore = useOfflineStore();
const toast = useToast();

const isDownloaded = computed(() => !!props.track && offlineStore.isItemDownloaded(trackId.value));
const isDownloading = computed(() => !!props.track && downloadStore.isDownloading(trackId.value));

function download() {
  if (!props.track) return;
  downloadStore.startDownload(trackId.value, props.track).catch((error: any) => {
    if (error?.name !== 'AbortError') toast.showError(t('detail.downloadFailed'));
  });
}

async function removeDownload() {
  if (!confirm(t('detail.confirmDelete', { name: trackName.value }))) return;
  try {
    await downloadService.deleteOfflineFile(trackId.value);
    await offlineStore.removeDownload(trackId.value);
  } catch {
    toast.showError(t('detail.deleteFailed'));
  }
}

const emit = defineEmits<{ playNext: []; addToQueue: [] }>();
</script>
