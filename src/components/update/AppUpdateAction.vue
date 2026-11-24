<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download } from 'lucide-vue-next';

import { Button } from '@/components/ui/button';
import { useAppUpdateStore } from '@/store/app-update-store';

const KNOWN_ERRORS = ['check_failed', 'download_failed', 'invalid_apk', 'wrong_package', 'not_newer', 'insecure_url'];

const { t } = useI18n();
const store = useAppUpdateStore();

const percent = computed(() => Math.round(store.progress * 100));
const errorKey = computed(() =>
  store.error ? `update.errors.${KNOWN_ERRORS.includes(store.error) ? store.error : 'download_failed'}` : null,
);
const label = computed(() => {
  if (store.status === 'installing') return t('update.installing');
  if (store.status === 'error') return t('update.retry');
  return t('update.install');
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="store.status === 'downloading'" class="flex flex-col gap-2">
      <div class="h-2 overflow-hidden rounded-full bg-surface-hover" role="progressbar"
        :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
        <div class="h-full rounded-full bg-accent-purple transition-[width] duration-200"
          :style="{ width: `${percent}%` }" />
      </div>
      <div class="flex items-center justify-between text-caption text-text-muted">
        <span>{{ t('update.downloading', { percent }) }}</span>
        <Button variant="link" size="sm" class="h-auto p-0 text-text-muted" @click="store.cancel()">
          {{ t('update.cancel') }}
        </Button>
      </div>
    </div>
    <Button v-else class="h-12 rounded-2xl text-body font-bold" :disabled="store.status === 'installing'"
      @click="store.startUpdate()">
      <Download />
      {{ label }}
    </Button>
    <p v-if="store.status === 'needsPermission'" class="text-caption text-text-muted">
      {{ t('update.permissionHint') }}
    </p>
    <p v-if="errorKey" class="text-caption text-error" role="alert">{{ t(errorKey) }}</p>
  </div>
</template>
