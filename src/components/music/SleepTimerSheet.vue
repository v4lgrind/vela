<template>
  <Drawer v-model:open="open" :should-scale-background="false">
    <DrawerContent class="z-[300] max-h-[85dvh] border-border-default bg-surface md:mx-auto md:max-w-xl">
      <div class="flex flex-col gap-1 px-4 pt-3 pb-[calc(16px+var(--sab,env(safe-area-inset-bottom,0px)))]">
        <DrawerTitle class="flex items-center gap-2 pb-2 text-section font-bold text-text-heading">
          <Moon class="size-5" /> {{ t('audio.sleepTimer') }}
        </DrawerTitle>
        <DrawerDescription class="sr-only">{{ t('audio.sleepTimer') }}</DrawerDescription>
        <button v-for="choice in choices" :key="choice.key" :class="ROW_CLASS" @click="pick(choice.mode, choice.minutes)">
          {{ choice.label }}
        </button>
        <button v-if="audio.sleepTimer" :class="cn(ROW_CLASS, 'text-accent-purple')" @click="cancel">
          {{ t('audio.sleep.cancel') }}
        </button>
      </div>
    </DrawerContent>
  </Drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Moon } from 'lucide-vue-next';

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import type { SleepMode } from '@/utils/sleepTimer';

const MINUTE_CHOICES = [15, 30, 45, 60];
const ROW_CLASS = 'flex min-h-12 items-center rounded-xl px-3 text-left text-body text-text-primary hover:bg-white/10 active:bg-white/10 cursor-pointer';

const open = defineModel<boolean>('open', { required: true });
const { t } = useI18n();
const audio = useAudioPlayerStore();

const choices = computed(() => [
  ...MINUTE_CHOICES.map((n) => ({ key: `m${n}`, mode: 'minutes' as SleepMode, minutes: n, label: t('audio.sleep.minutes', { n }) })),
  { key: 'track', mode: 'endOfTrack' as SleepMode, minutes: undefined, label: t('audio.sleep.endOfTrack') },
  { key: 'album', mode: 'endOfAlbum' as SleepMode, minutes: undefined, label: t('audio.sleep.endOfAlbum') },
]);

function pick(mode: SleepMode, minutes?: number) {
  audio.setSleepTimer(mode, minutes);
  open.value = false;
}

function cancel() {
  audio.cancelSleepTimer();
  open.value = false;
}
</script>
