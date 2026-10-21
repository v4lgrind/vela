<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const props = defineProps<{ title: string; subtitle?: string; back?: boolean; overImage?: boolean }>();

const { t } = useI18n();
const router = useRouter();

// Deep links (Android Auto, notifications) open a page with nothing behind it: land on Home.
function goBack() {
  if (window.history.state?.back) router.back();
  else router.replace({ name: 'libraries' });
}
</script>

<template>
  <header class="flex items-start gap-3 py-2">
    <Button
      v-if="props.back"
      variant="ghost"
      size="icon"
      :aria-label="t('common.back')"
      :class="cn('shrink-0 rounded-full', props.overImage && 'border-0 bg-black/40 text-white backdrop-blur-md')"
      @click="goBack">
      <ChevronLeft class="size-5" />
    </Button>
    <div :class="cn('min-w-0 flex-1', props.back && 'pt-1')">
      <h1
        :class="cn(
          'line-clamp-2 text-page font-bold text-text-heading lg:text-page-wide',
          props.overImage && 'sr-only',
        )">
        {{ props.title }}
      </h1>
      <p v-if="props.subtitle && !props.overImage" class="mt-1 text-caption text-text-muted">{{ props.subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
