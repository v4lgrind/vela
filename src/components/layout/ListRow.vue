<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next';
import { computed, useAttrs, type Component } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

import { cn } from '@/lib/utils';

const props = defineProps<{ label: string; value?: string; icon?: Component; to?: RouteLocationRaw; destructive?: boolean }>();

const attrs = useAttrs();
const clickable = computed(() => Boolean(props.to || attrs.onClick));
const tag = computed(() => (props.to ? RouterLink : clickable.value ? 'button' : 'div'));
</script>

<template>
  <component
    :is="tag"
    :to="props.to"
    :type="tag === 'button' ? 'button' : undefined"
    :class="cn(
      'flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-body',
      props.destructive ? 'text-error' : 'text-text-heading',
    )">
    <component :is="props.icon" v-if="props.icon" class="size-5 shrink-0" :stroke-width="1.8" />
    <span class="min-w-0 flex-1 truncate">{{ props.label }}</span>
    <span v-if="props.value" class="shrink-0 text-caption text-text-muted">{{ props.value }}</span>
    <ChevronRight v-if="clickable && !props.destructive" class="size-4 shrink-0 text-text-subtle" />
  </component>
</template>
