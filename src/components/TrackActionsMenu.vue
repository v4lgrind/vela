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
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui';
import { EllipsisVertical, ListPlus, ListStart } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const { t } = useI18n();
defineProps<{ triggerClass?: string }>();

const emit = defineEmits<{ playNext: []; addToQueue: [] }>();
</script>
