<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { useAppUpdateStore } from '@/store/app-update-store';
import { formatBytes } from '@/utils/helpers';

import AppUpdateAction from './AppUpdateAction.vue';

const { t } = useI18n();
const route = useRoute();
const store = useAppUpdateStore();

// Never over the video player; the sheet shows up on the next screen.
const open = computed({
  get: () => store.shouldPrompt && !route.path.startsWith('/play'),
  set: (value: boolean) => {
    if (!value) store.dismiss();
  },
});
const details = computed(() =>
  [`Vela ${store.update?.version ?? ''}`, formatBytes(store.update?.size)].filter(Boolean).join(' · '),
);
</script>

<template>
  <Drawer v-model:open="open" :should-scale-background="false">
    <DrawerContent class="max-h-[85dvh] border-border-default bg-surface md:mx-auto md:max-w-xl">
      <div class="flex flex-col gap-3 overflow-y-auto px-4 pt-3 pb-[calc(16px+var(--sab,env(safe-area-inset-bottom,0px)))]">
        <DrawerTitle class="text-section font-bold text-text-heading">{{ t('update.title') }}</DrawerTitle>
        <DrawerDescription class="text-caption text-text-muted">{{ details }}</DrawerDescription>

        <template v-if="store.update?.notes.length">
          <h3 class="mt-1 text-label font-semibold uppercase tracking-wide text-text-muted">{{ t('update.whatsNew') }}</h3>
          <ul class="m-0 flex list-disc flex-col gap-1 pl-5 text-body text-text-body">
            <li v-for="note in store.update.notes" :key="note">{{ note }}</li>
          </ul>
        </template>

        <AppUpdateAction class="mt-2" />
        <Button v-if="store.status !== 'downloading'" variant="link" class="text-text-muted" @click="open = false">
          {{ t('update.later') }}
        </Button>
      </div>
    </DrawerContent>
  </Drawer>
</template>
