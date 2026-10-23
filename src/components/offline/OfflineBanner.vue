<template>
  <div v-if="!offlineStore.isFullyOnline" role="status"
    class="flex items-center gap-3 rounded-2xl border border-border-default bg-surface-raised px-4 py-3">
    <WifiOff class="size-5 shrink-0 text-accent-purple-light" />
    <p class="min-w-0 text-sm font-medium text-text-heading">{{ t('offline.banner') }}</p>
  </div>
</template>

<script setup lang="ts">
import { WifiOff } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

import { useOfflineStore } from '@/store/offline-store';

const { t } = useI18n();
const offlineStore = useOfflineStore();
</script>
