<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="text-text-heading">
          Download options
        </DialogTitle>
        <DialogDescription class="text-text-muted text-sm">
          This content may not play smoothly on this device. You can download a compatible version.
        </DialogDescription>
      </DialogHeader>

      <!-- Audio track selection -->
      <div v-if="audioTracks.length > 0" class="flex flex-col gap-2">
        <label class="text-xs font-medium text-text-muted uppercase tracking-wide">Audio</label>
        <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
          <button
            v-for="track in audioTracks"
            :key="track.Index"
            @click="selectedAudio = track.Index"
            :class="[
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all cursor-pointer',
              selectedAudio === track.Index
                ? 'bg-accent-blue/20 border border-accent-blue/50 text-white'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10',
            ]"
          >
            <div
              :class="[
                'size-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                selectedAudio === track.Index ? 'border-accent-blue' : 'border-white/30',
              ]"
            >
              <div v-if="selectedAudio === track.Index" class="size-2 rounded-full bg-accent-blue" />
            </div>
            <span class="truncate">{{ track.DisplayTitle || `${track.Language || 'Unknown'} - ${track.Codec}` }}</span>
          </button>
        </div>
      </div>

      <!-- Subtitle track selection -->
      <div v-if="subtitleTracks.length > 0" class="flex flex-col gap-2">
        <label class="text-xs font-medium text-text-muted uppercase tracking-wide">Subtitles</label>
        <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
          <button
            @click="selectedSubtitle = -1"
            :class="[
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all cursor-pointer',
              selectedSubtitle === -1
                ? 'bg-accent-blue/20 border border-accent-blue/50 text-white'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10',
            ]"
          >
            <div
              :class="[
                'size-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                selectedSubtitle === -1 ? 'border-accent-blue' : 'border-white/30',
              ]"
            >
              <div v-if="selectedSubtitle === -1" class="size-2 rounded-full bg-accent-blue" />
            </div>
            <span>None</span>
          </button>
          <button
            v-for="track in subtitleTracks"
            :key="track.Index"
            @click="selectedSubtitle = track.Index"
            :class="[
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all cursor-pointer',
              selectedSubtitle === track.Index
                ? 'bg-accent-blue/20 border border-accent-blue/50 text-white'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10',
            ]"
          >
            <div
              :class="[
                'size-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                selectedSubtitle === track.Index ? 'border-accent-blue' : 'border-white/30',
              ]"
            >
              <div v-if="selectedSubtitle === track.Index" class="size-2 rounded-full bg-accent-blue" />
            </div>
            <span class="truncate">{{ track.DisplayTitle || `${track.Language || 'Unknown'} - ${track.Codec}` }}</span>
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-col gap-2 pt-2">
        <Button @click="handleConfirm" class="w-full justify-center gap-2">
          <Download class="size-4" /> Download compatible
        </Button>
        <Button variant="outline" @click="handleOriginal" class="w-full justify-center gap-2">
          <Download class="size-4" /> Download original
        </Button>
        <DialogClose as-child>
          <Button variant="ghost" class="w-full">Cancel</Button>
        </DialogClose>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-vue-next';

const props = defineProps<{
  item: any;
}>();

const open = defineModel<boolean>('open', { required: true });

const emit = defineEmits<{
  confirm: [options: { audioStreamIndex: number; subtitleStreamIndex: number }];
  original: [];
}>();

const audioTracks = computed(() =>
  (props.item?.MediaStreams ?? []).filter((s: any) => s.Type === 'Audio')
);

const subtitleTracks = computed(() =>
  (props.item?.MediaStreams ?? []).filter((s: any) => s.Type === 'Subtitle')
);

const selectedAudio = ref(-1);
const selectedSubtitle = ref(-1);

// Pre-select default tracks when dialog opens
watch(open, (isOpen) => {
  if (isOpen) {
    const defaultAudio = audioTracks.value.find((t: any) => t.IsDefault);
    selectedAudio.value = defaultAudio?.Index ?? audioTracks.value[0]?.Index ?? -1;

    const defaultSub = subtitleTracks.value.find((t: any) => t.IsDefault);
    selectedSubtitle.value = defaultSub?.Index ?? -1;
  }
});

function handleConfirm() {
  open.value = false;
  emit('confirm', {
    audioStreamIndex: selectedAudio.value,
    subtitleStreamIndex: selectedSubtitle.value,
  });
}

function handleOriginal() {
  open.value = false;
  emit('original');
}
</script>
