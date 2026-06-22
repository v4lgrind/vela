import { ref } from 'vue';

export type ToastType = 'error' | 'warning' | 'success' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const toasts = ref<ToastItem[]>([]);
let _nextId = 0;

function show(message: string, type: ToastType = 'info', duration = 4000) {
  const id = ++_nextId;
  toasts.value.push({ id, message, type });
  setTimeout(() => dismiss(id), duration);
}

function dismiss(id: number) {
  const idx = toasts.value.findIndex(t => t.id === id);
  if (idx !== -1) toasts.value.splice(idx, 1);
}

export function useToast() {
  return {
    toasts,
    show,
    showError: (msg: string) => show(msg, 'error'),
    showSuccess: (msg: string) => show(msg, 'success'),
    showWarning: (msg: string) => show(msg, 'warning'),
    dismiss,
  };
}
