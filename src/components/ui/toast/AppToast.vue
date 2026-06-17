<template>
  <ToastProvider>
    <ToastRoot
      v-for="toast in toasts"
      :key="toast.id"
      :open="true"
      :duration="Infinity"
      class="flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm
             data-[state=open]:animate-in data-[state=closed]:animate-out
             data-[state=closed]:fade-out-80 data-[state=open]:fade-in-0
             data-[state=open]:slide-in-from-bottom-2"
      :class="toastClass(toast.type)"
      @update:open="(v) => { if (!v) dismiss(toast.id); }"
    >
      <component :is="toastIcon(toast.type)" class="size-4 mt-0.5 shrink-0" />
      <ToastDescription class="flex-1 text-sm leading-snug">
        {{ toast.message }}
      </ToastDescription>
      <ToastClose
        class="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
        @click="dismiss(toast.id)"
      >
        <X class="size-3.5" />
      </ToastClose>
    </ToastRoot>
    <ToastViewport
      class="fixed bottom-safe-b right-4 z-[200] flex flex-col gap-2 w-[min(92vw,360px)] outline-none"
      :style="{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }"
    />
  </ToastProvider>
</template>

<script setup lang="ts">
import {
  ToastProvider,
  ToastRoot,
  ToastDescription,
  ToastClose,
  ToastViewport,
} from 'reka-ui';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-vue-next';
import { useToast, type ToastType } from '@/composables/useToast';

const { toasts, dismiss } = useToast();

function toastClass(type: ToastType) {
  return {
    error: 'bg-red-950/90 border-red-800 text-red-100',
    warning: 'bg-yellow-950/90 border-yellow-800 text-yellow-100',
    success: 'bg-green-950/90 border-green-800 text-green-100',
    info: 'bg-surface-raised/90 border-border-default text-text-default',
  }[type];
}

function toastIcon(type: ToastType) {
  return {
    error: AlertCircle,
    warning: AlertTriangle,
    success: CheckCircle,
    info: Info,
  }[type];
}
</script>
