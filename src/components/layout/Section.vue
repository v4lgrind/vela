<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { RouteLocationRaw } from 'vue-router';

const props = defineProps<{ title: string; to?: RouteLocationRaw }>();

const { t } = useI18n();
</script>

<template>
  <section class="mt-section first:mt-0">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h2 class="text-section font-semibold text-text-heading">{{ props.title }}</h2>
      <RouterLink
        v-if="props.to"
        :to="props.to"
        class="inline-flex min-h-11 items-center text-caption font-medium text-accent-purple">
        {{ t('common.seeAll') }}
      </RouterLink>
    </div>
    <slot />
  </section>
</template>
