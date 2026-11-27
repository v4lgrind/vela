<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="size-11 rounded-full text-text-primary hover:bg-white/10" :aria-label="t('audio.more')">
        <EllipsisVertical class="size-6" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent align="end" :side-offset="4" :class="MENU_CONTENT_CLASS">
        <DropdownMenuItem v-for="action in actions" :key="musicActionKey(action)" :class="MENU_ITEM_CLASS"
          @select="target && run(action, target)">
          <component :is="musicActionView(action, t).icon" class="size-4 shrink-0" />
          <span class="truncate">{{ musicActionView(action, t).label }}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator v-if="actions.length" class="my-1 h-px bg-border-default" />
        <DropdownMenuItem :class="MENU_ITEM_CLASS" @select="emit('sleepTimer')">
          <Moon class="size-4 shrink-0" /> {{ t('audio.sleepTimer') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui';
import { EllipsisVertical, Moon } from 'lucide-vue-next';

import { Button } from '@/components/ui/button';
import { useMusicActions } from '@/composables/useMusicActions';
import type { AudioTrack } from '@/store/audio-player-store';
import { trackTarget } from '@/utils/musicActions';

import { MENU_CONTENT_CLASS, MENU_ITEM_CLASS, musicActionKey, musicActionView } from './musicActionView';

/** The full-screen player's ⋯: go to the playing track's album / artists, radio, sleep timer. */
const props = defineProps<{ track: AudioTrack | null }>();
const emit = defineEmits<{ sleepTimer: [] }>();
const { t } = useI18n();
const { actionsFor, run } = useMusicActions();
const target = computed(() => (props.track ? trackTarget(props.track) : undefined));
const actions = computed(() => (target.value ? actionsFor(target.value, { queueActions: false }) : []));
</script>
