<template>
  <div class="min-h-dvh bg-surface text-text-body">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <Loader2 class="size-8 text-accent-purple animate-spin" />
    </div>

    <template v-else>
      <!-- Hero -->
      <div class="px-4 py-6 flex gap-5 items-start">
        <div class="shrink-0 w-28 aspect-[2/3] rounded-2xl overflow-hidden bg-surface-raised shadow-lg">
          <LazyImg
            :src="person?.Id ? store.getImageUrl(person.Id, 'Primary', 300) : ''"
            :alt="person?.Name ?? ''"
            item-type="person"
            class="w-full h-full object-cover object-top"
          />
        </div>
        <div class="flex-1 min-w-0 pt-1">
          <h2 class="text-xl font-bold text-text-heading leading-tight">{{ person?.Name }}</h2>
          <p v-if="filmography.length" class="text-xs text-text-muted mt-1">
            {{ filmography.length }} title{{ filmography.length !== 1 ? 's' : '' }}
          </p>
          <p v-if="person?.Overview" class="text-sm text-text-body mt-3 line-clamp-4 leading-relaxed">
            {{ person.Overview }}
          </p>
        </div>
      </div>

      <!-- Filmography -->
      <section v-if="filmography.length" class="px-4 pb-8">
        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">Filmography</h3>
        <div class="grid grid-cols-3 gap-3">
          <div
            v-for="item in filmography"
            :key="item.Id"
            class="cursor-pointer group"
            @click="router.push({ name: 'ItemDetails', params: { id: item.Id } })"
          >
            <div class="aspect-[2/3] rounded-xl overflow-hidden bg-surface-raised shadow mb-1.5 group-hover:-translate-y-0.5 transition-transform duration-200">
              <LazyImg
                :src="store.getImageUrl(item.Id, 'Primary', 300)"
                :alt="item.Name ?? ''"
                :item-type="item.Type?.toLowerCase() ?? 'movie'"
                class="w-full h-full object-cover"
              />
            </div>
            <p class="text-xs font-medium text-text-primary truncate">{{ item.Name }}</p>
            <p v-if="item.ProductionYear" class="text-xs text-text-subtle">{{ item.ProductionYear }}</p>
          </div>
        </div>
      </section>

      <div v-if="!filmography.length && !loading" class="flex flex-col items-center justify-center py-16 text-text-muted">
        <p class="text-sm">No titles found</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import LazyImg from '@/components/LazyImg.vue';
import { Loader2 } from 'lucide-vue-next';

const props = defineProps<{ id: string }>();

const router = useRouter();
const store = useJellyfinStore();

const loading = ref(true);
const person = ref<any>(null);
const filmography = ref<any[]>([]);

onMounted(async () => {
  try {
    const [personData, items] = await Promise.all([
      store.fetchPersonDetails(props.id),
      store.fetchPersonFilmography(props.id),
    ]);
    person.value = personData;
    filmography.value = items;
  } finally {
    loading.value = false;
  }
});
</script>
