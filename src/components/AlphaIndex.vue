<template>
  <!-- 44px-wide strip: drag a finger along it, the letter under the finger is applied on release. -->
  <div
    ref="strip"
    :aria-label="t('library.alphaIndex')"
    role="group"
    class="fixed right-0 z-10 flex w-11 touch-none select-none flex-col items-center justify-between py-2
           top-[calc(var(--sat,env(safe-area-inset-top,0px))+140px)]
           bottom-[calc(var(--sab,env(safe-area-inset-bottom,0px))+110px)]"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="preview = null">
    <button
      v-for="letter in letters" :key="letter"
      type="button"
      class="flex w-full flex-1 items-center justify-center text-[12px] font-bold leading-none"
      :class="(preview ?? active) === letter ? 'text-accent-purple' : 'text-text-muted'"
      @click="onClick(letter)">
      {{ letter }}
    </button>
    <div
      v-if="preview"
      class="pointer-events-none fixed right-14 top-1/2 flex size-16 -translate-y-1/2 items-center justify-center
             rounded-2xl bg-surface-raised text-[32px] font-bold text-text-heading shadow-xl">
      {{ preview }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { letterAt } from '@/utils/alphaIndex';

const props = defineProps<{ letters: readonly string[]; active?: string }>();
const emit = defineEmits<{ select: [letter: string] }>();

const { t } = useI18n();
const strip = ref<HTMLElement | null>(null);
const preview = ref<string | null>(null);
// A touch drag already selected on release; ignore the click the browser fires after it.
let skipClick = false;

function pick(e: PointerEvent) {
  const rect = strip.value!.getBoundingClientRect();
  preview.value = letterAt(e.clientY - rect.top, rect.height, props.letters);
}

function onDown(e: PointerEvent) {
  if (e.pointerType === 'mouse') return;
  strip.value?.setPointerCapture(e.pointerId);
  pick(e);
}

function onMove(e: PointerEvent) {
  if (preview.value !== null) pick(e);
}

function onUp() {
  if (preview.value === null) return;
  emit('select', preview.value);
  preview.value = null;
  skipClick = true;
  setTimeout(() => { skipClick = false; }, 400);
}

function onClick(letter: string) {
  if (!skipClick) emit('select', letter);
}
</script>
