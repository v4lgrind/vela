<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-vue-next';

const { t } = useI18n();
export interface SheetItem {
    key: string | number;
    label: string;
    selected: boolean;
}

defineProps<{
    open: boolean;
    title: string;
    items: SheetItem[];
}>();

const emit = defineEmits<{
    (e: 'select', key: string | number): void;
    (e: 'close'): void;
}>();
</script>

<template>
    <!-- Scrim + sheet live inside the player overlay (z above controls) -->
    <Transition name="sheet-fade">
        <div v-if="open" class="absolute inset-0 z-[160] flex flex-col justify-end" @click.self="emit('close')">
            <Transition name="sheet-slide" appear>
                <div v-if="open"
                    class="bg-[rgba(20,20,22,0.98)] backdrop-blur-md border-t border-white/10 rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.6)] max-h-[60vh] flex flex-col"
                    style="padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px))">
                    <!-- Grab handle -->
                    <div class="flex justify-center pt-2.5 pb-1">
                        <div class="w-9 h-1 rounded-full bg-white/25"></div>
                    </div>
                    <!-- Header -->
                    <div class="flex items-center justify-between px-5 pt-1 pb-2">
                        <h3 class="text-base font-semibold text-white">{{ title }}</h3>
                        <button :aria-label="t('common.close')" class="flex size-11 items-center justify-center text-white/50 hover:text-white transition-colors -mr-2" @click="emit('close')">
                            <X class="size-5" />
                        </button>
                    </div>
                    <!-- Options -->
                    <div class="overflow-y-auto scrollbar-hide px-2 pb-1">
                        <button v-for="item in items" :key="item.key"
                            class="w-full flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer text-[0.95rem] text-left transition-colors hover:bg-white/10 active:opacity-75"
                            :class="cn(item.selected && 'bg-accent-purple/20 text-white')"
                            @click="emit('select', item.key)">
                            <Check class="size-4 shrink-0 text-accent-purple"
                                :class="item.selected ? 'opacity-100' : 'opacity-0'" />
                            <span class="flex-1">{{ item.label }}</span>
                        </button>
                    </div>
                    <!-- Optional footer (e.g. subtitle size stepper) -->
                    <div v-if="$slots.footer" class="px-5 pt-2 pb-1 border-t border-white/10 mt-1">
                        <slot name="footer" />
                    </div>
                </div>
            </Transition>
        </div>
    </Transition>
</template>

<style scoped>
.sheet-fade-enter-active,
.sheet-fade-leave-active {
    transition: opacity 200ms ease;
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
    opacity: 0;
}
.sheet-slide-enter-active {
    transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sheet-slide-leave-active {
    transition: transform 200ms ease-in;
}
.sheet-slide-enter-from,
.sheet-slide-leave-to {
    transform: translateY(100%);
}
</style>
