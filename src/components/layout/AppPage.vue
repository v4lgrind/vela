<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{ width?: 'full' | 'content'; class?: HTMLAttributes['class'] }>(), {
  width: 'full',
  class: undefined,
});
</script>

<template>
  <div
    :class="cn(
      'w-full px-gutter pt-[calc(var(--sat,env(safe-area-inset-top,0px))+12px)] md:px-gutter-wide',
      props.width === 'content' && 'mx-auto max-w-[1200px]',
      props.class,
    )">
    <slot />
  </div>
</template>
