<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="text-text-heading">
          Download options
        </DialogTitle>
        <DialogDescription class="text-text-muted text-sm">
          Choose the quality and tracks for your offline copy.
        </DialogDescription>
      </DialogHeader>

      <!-- Compatibility status -->
      <div
        :class="[
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
          needsConversion
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300',
        ]"
      >
        <AlertTriangle v-if="needsConversion" class="size-4 flex-shrink-0" />
        <Check v-else class="size-4 flex-shrink-0" />
        <span>
          {{ needsConversion
            ? 'Not compatible with this device — it will be converted for playback.'
            : 'Compatible with this device — plays as-is.' }}
        </span>
      </div>

      <!-- Resolution selection -->
      <div class="flex flex-col gap-2">
        <label class="text-xs font-medium text-text-muted uppercase tracking-wide">Resolution</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="preset in resolutionPresets"
            :key="preset.bitrate"
            @click="selectedBitrate = preset.bitrate"
            :class="[
              'px-3 py-1.5 rounded-lg text-sm transition-all cursor-pointer border',
              selectedBitrate === preset.bitrate
                ? 'bg-accent-blue/20 border-accent-blue/50 text-white'
                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10',
            ]"
          >
            {{ preset.label === 'Auto' ? 'Original' : preset.label }}
          </button>
        </div>
      </div>

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

      <!-- Estimated size -->
      <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm">
        <span class="text-text-muted">
          {{ itemCount > 1 ? `Estimated total (${itemCount} items)` : 'Estimated size' }}
        </span>
        <span class="font-medium text-white">{{ sizeLabel }}</span>
      </div>

      <!-- Actions -->
      <div class="flex flex-col gap-2 pt-2">
        <Button @click="handleConfirm" class="w-full justify-center gap-2">
          <Download class="size-4" /> Download
        </Button>
        <Button v-if="needsConversion" variant="outline" @click="handleOriginal" class="w-full justify-center gap-2">
          <Download class="size-4" /> Download original (may not play)
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
import { Download, Check, AlertTriangle } from 'lucide-vue-next';
import { QUALITY_PRESETS } from '@/constants';
import { formatBytes } from '@/utils/helpers';

const props = defineProps<{
  /** Representative item — drives audio/subtitle track lists and source resolution. */
  item: any;
  /** All items covered by this download (single item, a season, or several episodes). */
  items?: any[];
  /** Whether the source needs conversion to play on this device. */
  needsConversion?: boolean;
}>();

const open = defineModel<boolean>('open', { required: true });

const emit = defineEmits<{
  confirm: [options: { audioStreamIndex: number; subtitleStreamIndex: number; maxBitrate: number }];
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
const selectedBitrate = ref(0); // 0 = Auto / original resolution

// Only offer presets at or below the source resolution.
const sourceHeight = computed(() => {
  const streams = props.item?.MediaStreams ?? props.item?.MediaSources?.[0]?.MediaStreams ?? [];
  return streams.find((s: any) => s.Type === 'Video')?.Height ?? 0;
});
const resolutionPresets = computed(() => {
  const h = sourceHeight.value;
  if (!h) return QUALITY_PRESETS;
  return QUALITY_PRESETS.filter((p) => p.minHeight === 0 || p.minHeight <= h);
});

const downloadItems = computed(() =>
  props.items?.length ? props.items : props.item ? [props.item] : []
);
const itemCount = computed(() => downloadItems.value.length);

/** Estimate a single item's on-disk size for the selected bitrate. */
function estimateItemBytes(it: any, bitrate: number): number {
  const runtimeTicks = it?.RunTimeTicks ?? it?.MediaSources?.[0]?.RunTimeTicks ?? 0;
  const seconds = runtimeTicks / 10_000_000;
  if (bitrate > 0) return (bitrate / 8) * seconds;
  // Auto / original: prefer the real file size, else derive from the source bitrate.
  const size = it?.MediaSources?.[0]?.Size ?? it?.Size ?? 0;
  if (size > 0) return size;
  const srcBitrate = it?.MediaSources?.[0]?.Bitrate ?? it?.Bitrate ?? 0;
  return srcBitrate > 0 ? (srcBitrate / 8) * seconds : 0;
}

const totalBytes = computed(() =>
  downloadItems.value.reduce((sum, it) => sum + estimateItemBytes(it, selectedBitrate.value), 0)
);
const sizeLabel = computed(() => formatBytes(totalBytes.value) ?? 'Unknown');

// Pre-select default tracks and reset resolution when dialog opens
watch(open, (isOpen) => {
  if (isOpen) {
    const defaultAudio = audioTracks.value.find((t: any) => t.IsDefault);
    selectedAudio.value = defaultAudio?.Index ?? audioTracks.value[0]?.Index ?? -1;

    const defaultSub = subtitleTracks.value.find((t: any) => t.IsDefault);
    selectedSubtitle.value = defaultSub?.Index ?? -1;

    selectedBitrate.value = 0;
  }
});

function handleConfirm() {
  open.value = false;
  emit('confirm', {
    audioStreamIndex: selectedAudio.value,
    subtitleStreamIndex: selectedSubtitle.value,
    maxBitrate: selectedBitrate.value,
  });
}

function handleOriginal() {
  open.value = false;
  emit('original');
}
</script>
