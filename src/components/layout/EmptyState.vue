<script setup lang="ts">
import type { Component } from 'vue';

const props = defineProps<{ icon: Component; title: string; text?: string }>();
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-6 py-16 text-center">
    <component :is="props.icon" class="size-12 text-text-subtle" :stroke-width="1.5" />
    <h2 class="text-section font-semibold text-text-heading">{{ props.title }}</h2>
    <p v-if="props.text" class="max-w-sm text-body text-text-muted">{{ props.text }}</p>
    <div v-if="$slots.action" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>
