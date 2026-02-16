<template>
  <img ref="imgRef" :src="loaded ? src : placeholder" :alt="alt"
    :class="cn('opacity-0 transition-opacity duration-300', loaded && 'opacity-100', $attrs.class as string)"
    @error="onError" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { cn } from '@/lib/utils';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  src: string;
  alt?: string;
  itemType?: string;
  rootMargin?: string;
}>();

const store = useJellyfinStore();
const imgRef = ref<HTMLImageElement | null>(null);
const loaded = ref(false);
let observer: IntersectionObserver | null = null;

const placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3Crect fill="%231e1e1e" width="1" height="1"/%3E%3C/svg%3E';

function onError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.src = store.getPlaceholderImage(props.itemType || 'default');
}

function observe() {
  if (!imgRef.value) return;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          loaded.value = true;
          observer?.disconnect();
          observer = null;
          break;
        }
      }
    },
    { rootMargin: props.rootMargin ?? '200px' }
  );
  observer.observe(imgRef.value);
}

onMounted(observe);

watch(() => props.src, () => {
  loaded.value = false;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  observe();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>
