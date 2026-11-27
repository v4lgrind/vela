<template>
  <ContextMenuRoot @update:open="onOpenChange">
    <ContextMenuTrigger as-child :disabled="!target" @pointerdown="resetPress" @click.capture="swallowClick">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent :collision-padding="menuCollisionPadding()"
        :class="cn(MENU_CONTENT_CLASS, 'max-h-(--reka-context-menu-content-available-height) overflow-y-auto')">
        <ContextMenuItem v-for="action in actions" :key="musicActionKey(action)" :class="MENU_ITEM_CLASS"
          @select="target && run(action, target, track)">
          <component :is="musicActionView(action, t).icon" class="size-4 shrink-0" />
          <span class="truncate">{{ musicActionView(action, t).label }}</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ContextMenuContent, ContextMenuItem, ContextMenuPortal, ContextMenuRoot, ContextMenuTrigger } from 'reka-ui';

import { useMusicActions } from '@/composables/useMusicActions';
import type { Track } from '@/domain';
import type { MusicTarget } from '@/utils/musicActions';

import { cn } from '@/lib/utils';

import { MENU_CONTENT_CLASS, MENU_ITEM_CLASS, menuCollisionPadding, musicActionKey, musicActionView } from './musicActionView';

// target: undefined leaves the slot as is (e.g. a movie in a mixed grid).
const props = defineProps<{ target?: MusicTarget; track?: Track }>();
const { t } = useI18n();
const { actionsFor, run } = useMusicActions();
const actions = computed(() => (props.target ? actionsFor(props.target) : []));

// The finger lifting after a long press must not also open the item.
let openedByPress = false;
function onOpenChange(open: boolean) {
  if (open) openedByPress = true;
}
function resetPress() {
  openedByPress = false;
}
function swallowClick(event: MouseEvent) {
  if (!openedByPress) return;
  openedByPress = false;
  event.preventDefault();
  event.stopPropagation();
}
</script>
