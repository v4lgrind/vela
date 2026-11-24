<template>
  <div class="rounded-xl border border-border-input bg-surface-raised/60 p-4 text-center">
    <p class="text-xs text-text-muted mb-3">{{ hint }}</p>
    <a v-if="url" :href="url" target="_blank" rel="noopener noreferrer"
      class="mb-3 inline-block text-sm font-semibold text-accent-purple hover:underline">{{ urlLabel }}</a>
    <div class="flex justify-center gap-2 mb-3" :aria-label="code">
      <span
        v-for="(ch, i) in code.split('')"
        :key="i"
        class="w-9 h-11 flex items-center justify-center rounded-lg bg-surface border border-border-input text-xl font-mono font-bold text-text-heading"
      >{{ ch }}</span>
    </div>
    <div class="flex items-center justify-center gap-2 text-xs text-text-muted">
      <Loader2 class="size-3.5 animate-spin" />
      <span>{{ t('login.waitingApproval') }}</span>
    </div>
    <Button variant="link" class="mt-1 text-xs text-text-muted" @click="emit('cancel')">{{ t('common.cancel') }}</Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loader2 } from 'lucide-vue-next';

import { Button } from '@/components/ui/button';

const props = defineProps<{ code: string; hint: string; url?: string }>();
const emit = defineEmits<{ cancel: [] }>();
const { t } = useI18n();

const urlLabel = computed(() => props.url?.replace(/^https?:\/\//, '') ?? '');
</script>
