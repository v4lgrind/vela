<template>
  <AppPage class="min-h-dvh bg-background pb-6 text-text-primary">
    <PageHeader :title="t('downloads.title')" class="mb-4" />

    <EmptyState v-if="!offlineStore.downloadCount && !activeGroups.length && !failedTasks.length"
      :icon="DownloadIcon" :title="t('downloads.emptyTitle')" :text="t('downloads.emptyText')">
      <template #action>
        <Button as-child><router-link :to="{ name: 'libraryList' }">{{ t('downloads.browse') }}</router-link></Button>
      </template>
    </EmptyState>

    <div v-else class="flex flex-col gap-6">
      <!-- Storage summary -->
      <div class="flex items-center gap-3 rounded-2xl border border-border-default bg-surface px-4 py-3">
        <div class="min-w-0 flex-1">
          <div class="text-body font-semibold text-text-heading">{{ t('downloads.onDevice', { size: formatSize(storage.total) }) }}</div>
          <div class="text-caption text-text-muted">{{ storageDetail }}</div>
        </div>
        <router-link :to="{ name: 'libraryList' }"
          class="inline-flex min-h-11 items-center text-sm font-semibold text-accent-purple">
          {{ t('downloads.browseShort') }}
        </router-link>
      </div>

      <!-- Running downloads: an album counts as one row -->
      <section v-if="activeGroups.length" :aria-label="t('downloads.inProgress', { n: activeGroups.length })">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-label font-semibold uppercase tracking-wide text-text-muted">
            {{ t('downloads.inProgress', { n: activeGroups.length }) }}
          </h2>
          <Button variant="ghost" size="sm" class="text-error hover:text-error-dark" @click="cancelAll">
            {{ t('downloads.cancelAll') }}
          </Button>
        </div>
        <ul class="flex flex-col">
          <li v-for="group in activeGroups" :key="group.key" class="flex items-center gap-3 py-2">
            <LazyImg :src="artworkUrl(group.key, imageUrl(group.image, SMALL))" :alt="group.name" kind="track"
              class="size-12 shrink-0 rounded-lg object-cover" />
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="flex justify-between gap-2">
                <span class="truncate text-body font-semibold text-text-heading">{{ group.name }}</span>
                <span class="shrink-0 text-caption text-text-primary tabular-nums">{{ group.progress }}%</span>
              </div>
              <div class="h-1 overflow-hidden rounded-full bg-border-default">
                <div class="h-full rounded-full bg-accent-purple transition-all" :style="{ width: group.progress + '%' }" />
              </div>
              <span v-if="group.total > 1" class="text-caption text-text-muted">
                {{ t('downloads.tracksOf', { done: group.done, total: group.total }) }}
              </span>
            </div>
            <Button variant="ghost" size="icon" class="shrink-0 rounded-full"
              :aria-label="t('audio.cancelDownload')" @click="cancelGroup(group.itemIds)">
              <X class="size-5" />
            </Button>
          </li>
        </ul>
      </section>

      <!-- Failures -->
      <section v-if="failedTasks.length" :aria-label="t('downloads.failed', { n: failedTasks.length })">
        <h2 class="mb-2 text-label font-semibold uppercase tracking-wide text-text-muted">
          {{ t('downloads.failed', { n: failedTasks.length }) }}
        </h2>
        <ul class="flex flex-col">
          <li v-for="task in failedTasks" :key="task.itemId" class="flex items-center gap-3 py-2">
            <div class="min-w-0 flex-1">
              <div class="truncate text-body font-semibold text-text-heading">{{ task.name }}</div>
              <div class="text-caption text-error">{{ t('detail.downloadFailed') }}</div>
            </div>
            <Button variant="secondary" size="sm" class="shrink-0 rounded-full" @click="downloadStore.retry(task.itemId)">
              <RotateCcw class="size-4" /> {{ t('downloads.retry') }}
            </Button>
            <Button variant="ghost" size="icon" class="shrink-0 rounded-full" :aria-label="t('downloads.dismiss')"
              @click="downloadStore.removeTask(task.itemId)">
              <X class="size-5" />
            </Button>
          </li>
        </ul>
      </section>

      <!-- What is on the device -->
      <section v-if="storedGroups.length" :aria-label="t('downloads.stored')">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-label font-semibold uppercase tracking-wide text-text-muted">{{ t('downloads.stored') }}</h2>
          <Button variant="ghost" size="sm" class="text-error hover:text-error-dark" @click="deleteAll">
            {{ t('downloads.deleteAll') }}
          </Button>
        </div>
        <ul class="flex flex-col">
          <li v-for="group in storedGroups" :key="group.key" class="flex items-center gap-3 py-1.5">
            <router-link :to="{ name: 'ItemDetails', params: { id: group.imageId } }" class="flex min-h-11 min-w-0 flex-1 items-center gap-3">
              <LazyImg :src="artworkUrl(group.imageId, imageUrl(group.image, SMALL))"
                :alt="group.name" :kind="group.kind"
                class="size-12 shrink-0 rounded-lg object-cover" />
              <div class="min-w-0">
                <div class="truncate text-body font-semibold text-text-heading">{{ group.name }}</div>
                <div class="text-caption text-text-muted">{{ groupMeta(group) }}</div>
              </div>
            </router-link>
            <Button variant="ghost" size="icon" class="shrink-0 rounded-full text-text-muted"
              :aria-label="t('detail.confirmDelete', { name: group.name })" @click="deleteGroup(group)">
              <Trash2 class="size-5" />
            </Button>
          </li>
        </ul>
      </section>
    </div>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download as DownloadIcon, RotateCcw, Trash2, X } from 'lucide-vue-next';

import LazyImg from '@/components/LazyImg.vue';
import { AppPage, EmptyState, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useImageUrl } from '@/composables/useBackend';
import { useOfflineArtwork } from '@/composables/useOfflineArtwork';
import { downloadService } from '@/services/downloadService';
import { useDownloadStore } from '@/store/download-store';
import { useOfflineStore } from '@/store/offline-store';
import { groupActiveTasks, groupStored, storageByKind, type StoredGroup } from '@/utils/downloadGroups';

const { t } = useI18n();
const offlineStore = useOfflineStore();
const imageUrl = useImageUrl();
const SMALL = { width: 150, height: 150 };
const downloadStore = useDownloadStore();
const { artworkUrl, preload } = useOfflineArtwork();

const tasks = computed(() => [...downloadStore.tasks.values()]);
const activeGroups = computed(() => groupActiveTasks(tasks.value));
const failedTasks = computed(() => tasks.value.filter((task) => task.status === 'failed'));
const storedGroups = computed(() => groupStored(offlineStore.downloads));
const storage = computed(() => storageByKind(offlineStore.downloads));

const storageDetail = computed(() => [
  storage.value.movies && t('downloads.storageOf', { type: t('downloads.movies'), size: formatSize(storage.value.movies) }),
  storage.value.series && t('downloads.storageOf', { type: t('downloads.shows'), size: formatSize(storage.value.series) }),
  storage.value.music && t('downloads.storageOf', { type: t('downloads.music'), size: formatSize(storage.value.music) }),
].filter(Boolean).join(' · '));

function groupMeta(group: StoredGroup): string {
  const size = formatSize(group.size);
  if (group.kind === 'series') return `${t('downloads.episodesCount', group.count)} · ${size}`;
  if (group.kind === 'album') return `${t('downloads.tracksCount', group.count)} · ${size}`;
  return size;
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function cancelGroup(itemIds: string[]) {
  for (const id of itemIds) {
    if (downloadStore.isDownloading(id)) downloadStore.cancelDownload(id);
  }
}

function cancelAll() {
  if (!confirm(t('downloads.confirmCancelAll'))) return;
  downloadStore.cancelAll();
}

async function deleteItems(itemIds: string[]) {
  for (const id of itemIds) {
    await downloadService.deleteOfflineFile(id);
    await offlineStore.removeDownload(id);
  }
}

async function deleteGroup(group: StoredGroup) {
  if (!confirm(t('detail.confirmDelete', { name: group.name }))) return;
  try {
    await deleteItems(group.itemIds);
  } catch {
    alert(t('detail.deleteFailed'));
  }
}

async function deleteAll() {
  if (!confirm(t('downloads.confirmDeleteAll', { n: offlineStore.downloadCount }))) return;
  try {
    await deleteItems(offlineStore.downloads.map((download) => download.itemId));
  } catch {
    alert(t('downloads.deleteSomeFailed'));
  }
}

watch([storedGroups, activeGroups], () => {
  void preload([...storedGroups.value.map((group) => group.imageId), ...activeGroups.value.map((group) => group.key)]);
}, { immediate: true });

onMounted(async () => {
  await offlineStore.loadDownloads();
  if (offlineStore.isFullyOnline) await offlineStore.refreshOfflineAssets();
});
</script>
