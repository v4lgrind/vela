<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Info, RefreshCw } from 'lucide-vue-next';

import { ListRow } from '@/components/layout';
import { useAppUpdateStore } from '@/store/app-update-store';
import { formatBytes } from '@/utils/helpers';

import AppUpdateAction from './AppUpdateAction.vue';

const { t } = useI18n();
const store = useAppUpdateStore();

const checkLabel = computed(() => (store.status === 'checking' ? t('update.checking') : t('update.check')));
const checkValue = computed(() => (store.status === 'upToDate' ? t('update.upToDate') : undefined));
const size = computed(() => formatBytes(store.update?.size));
</script>

<template>
  <!-- Card body of the Settings "App" section; the page styles the card. -->
  <div class="divide-y divide-border-default">
    <ListRow :icon="Info" :label="t('update.version')" :value="store.installedVersion" />
    <div v-if="store.update" class="flex flex-col gap-3 p-4">
      <div>
        <div class="text-body font-semibold text-text-heading">
          {{ t('update.updateTo', { version: store.update.version }) }}
        </div>
        <p v-if="size" class="mt-0.5 text-caption text-text-muted">{{ size }}</p>
      </div>
      <AppUpdateAction />
    </div>
    <template v-else>
      <ListRow :icon="RefreshCw" :label="checkLabel" :value="checkValue"
        :disabled="store.status === 'checking'" @click="store.checkForUpdate({ force: true })" />
      <p v-if="store.error" class="px-4 py-3 text-caption text-error" role="alert">
        {{ t('update.errors.check_failed') }}
      </p>
    </template>
  </div>
</template>
