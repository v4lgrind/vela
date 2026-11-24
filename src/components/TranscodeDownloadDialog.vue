<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="text-text-heading">
          {{ t('transcode.title') }}
        </DialogTitle>
        <DialogDescription class="text-text-muted text-sm">
          {{ t('transcode.description') }}
        </DialogDescription>
      </DialogHeader>

      <!-- Compatibility status -->
      <div
        :class="[
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
          needsConversion
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300 in-[.light]:text-amber-700'
            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 in-[.light]:text-emerald-700',
        ]"
      >
        <AlertTriangle v-if="needsConversion" class="size-4 flex-shrink-0" />
        <Check v-else class="size-4 flex-shrink-0" />
        <span>
          {{ needsConversion
            ? t('transcode.notCompatible')
            : t('transcode.compatible') }}
        </span>
      </div>

      <!-- Resolution selection -->
      <div class="flex flex-col gap-2">
        <label class="text-xs font-medium text-text-muted uppercase tracking-wide">{{ t('transcode.resolution') }}</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="preset in resolutionPresets"
            :key="preset.bitrate"
            @click="selectedBitrate = preset.bitrate"
            :class="[
              'px-3 py-1.5 rounded-lg text-sm transition-all cursor-pointer border',
              selectedBitrate === preset.bitrate
                ? 'bg-accent-blue/20 border-accent-blue/50 text-text-heading'
                : 'bg-surface-hover border-border-input text-text-primary hover:bg-border-input',
            ]"
          >
            {{ preset.label === 'Auto' ? t('settings.original') : preset.label }}
          </button>
        </div>
      </div>

      <!-- Audio track selection -->
      <div v-if="audioTracks.length > 0" class="flex flex-col gap-2">
        <label class="text-xs font-medium text-text-muted uppercase tracking-wide">{{ t('types.Audio') }}</label>
        <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
          <button
            v-for="track in audioTracks"
            :key="track.id"
            @click="selectedAudio = track.id"
            :class="[
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all cursor-pointer',
              selectedAudio === track.id
                ? 'bg-accent-blue/20 border border-accent-blue/50 text-text-heading'
                : 'bg-surface-hover border border-border-input text-text-primary hover:bg-border-input',
            ]"
          >
            <div
              :class="[
                'size-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                selectedAudio === track.id ? 'border-accent-blue' : 'border-text-subtle',
              ]"
            >
              <div v-if="selectedAudio === track.id" class="size-2 rounded-full bg-accent-blue" />
            </div>
            <span class="truncate">{{ track.title || `${track.language || 'Unknown'} - ${track.codec}` }}</span>
          </button>
        </div>
      </div>

      <!-- Subtitle track selection -->
      <div v-if="subtitleTracks.length > 0" class="flex flex-col gap-2">
        <label class="text-xs font-medium text-text-muted uppercase tracking-wide">{{ t('transcode.subtitles') }}</label>
        <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
          <button
            @click="selectedSubtitle = NO_SUBTITLE"
            :class="[
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all cursor-pointer',
              selectedSubtitle === NO_SUBTITLE
                ? 'bg-accent-blue/20 border border-accent-blue/50 text-text-heading'
                : 'bg-surface-hover border border-border-input text-text-primary hover:bg-border-input',
            ]"
          >
            <div
              :class="[
                'size-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                selectedSubtitle === NO_SUBTITLE ? 'border-accent-blue' : 'border-text-subtle',
              ]"
            >
              <div v-if="selectedSubtitle === NO_SUBTITLE" class="size-2 rounded-full bg-accent-blue" />
            </div>
            <span>{{ t('transcode.none') }}</span>
          </button>
          <button
            v-for="track in subtitleTracks"
            :key="track.id"
            @click="selectedSubtitle = track.id"
            :class="[
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all cursor-pointer',
              selectedSubtitle === track.id
                ? 'bg-accent-blue/20 border border-accent-blue/50 text-text-heading'
                : 'bg-surface-hover border border-border-input text-text-primary hover:bg-border-input',
            ]"
          >
            <div
              :class="[
                'size-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                selectedSubtitle === track.id ? 'border-accent-blue' : 'border-text-subtle',
              ]"
            >
              <div v-if="selectedSubtitle === track.id" class="size-2 rounded-full bg-accent-blue" />
            </div>
            <span class="truncate">{{ track.title || `${track.language || 'Unknown'} - ${track.codec}` }}</span>
          </button>
        </div>
      </div>

      <!-- Estimated size -->
      <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-hover border border-border-input text-sm">
        <span class="text-text-muted">
          {{ itemCount > 1 ? t('transcode.estimatedTotal', { n: itemCount }) : t('transcode.estimatedSize') }}
        </span>
        <span class="font-medium text-text-heading">{{ sizeLabel }}</span>
      </div>

      <!-- Actions -->
      <div class="flex flex-col gap-2 pt-2">
        <Button @click="handleConfirm" class="w-full justify-center gap-2">
          <Download class="size-4" /> {{ t('detail.download') }}
        </Button>
        <Button v-if="needsConversion" variant="outline" @click="handleOriginal" class="w-full justify-center gap-2">
          <Download class="size-4" /> {{ t('transcode.original') }}
        </Button>
        <DialogClose as-child>
          <Button variant="ghost" class="w-full">{{ t('common.cancel') }}</Button>
        </DialogClose>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, computed, watch } from 'vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Check, AlertTriangle } from 'lucide-vue-next';
import { QUALITY_PRESETS } from '@/constants';
import type { MediaItem, MediaVersion } from '@/domain';
import type { TranscodeOptions } from '@/store/download-store';
import { formatBytes } from '@/utils/helpers';

const { t } = useI18n();
const props = defineProps<{
  /** Representative item — drives audio/subtitle track lists and source resolution. */
  item: MediaItem | null;
  /** All items covered by this download (single item, a season, or several episodes). */
  items?: MediaItem[];
  /** Whether the source needs conversion to play on this device. */
  needsConversion?: boolean;
}>();

const open = defineModel<boolean>('open', { required: true });

const emit = defineEmits<{
  confirm: [options: TranscodeOptions];
  original: [];
}>();

const NO_SUBTITLE = '';
const MS_PER_SECOND = 1000;

function versionOf(item: MediaItem | null | undefined): MediaVersion | undefined {
  return item && 'versions' in item ? item.versions[0] : undefined;
}

const version = computed(() => versionOf(props.item));
const audioTracks = computed(() => version.value?.audio ?? []);
const subtitleTracks = computed(() => version.value?.subtitles ?? []);

const selectedAudio = ref<string | undefined>(undefined);
const selectedSubtitle = ref(NO_SUBTITLE);
const selectedBitrate = ref(0); // 0 = Auto / original resolution

// Only offer presets at or below the source resolution.
const sourceHeight = computed(() => version.value?.video[0]?.height ?? 0);
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
function estimateItemBytes(item: MediaItem, bitrate: number): number {
  const source = versionOf(item);
  const seconds = (item.durationMs ?? source?.durationMs ?? 0) / MS_PER_SECOND;
  if (bitrate > 0) return (bitrate / 8) * seconds;
  // Auto / original: prefer the real file size, else derive from the source bitrate.
  if (source?.sizeBytes) return source.sizeBytes;
  return source?.bitrate ? (source.bitrate / 8) * seconds : 0;
}

const totalBytes = computed(() =>
  downloadItems.value.reduce((sum, item) => sum + estimateItemBytes(item, selectedBitrate.value), 0)
);
const sizeLabel = computed(() => formatBytes(totalBytes.value) ?? t('transcode.unknown'));

// Pre-select default tracks and reset resolution when dialog opens
watch(open, (isOpen) => {
  if (isOpen) {
    selectedAudio.value = (audioTracks.value.find((track) => track.isDefault) ?? audioTracks.value[0])?.id;
    selectedSubtitle.value = subtitleTracks.value.find((track) => track.isDefault)?.id ?? NO_SUBTITLE;
    selectedBitrate.value = 0;
  }
});

function handleConfirm() {
  open.value = false;
  emit('confirm', {
    audioStreamId: selectedAudio.value,
    subtitleStreamId: selectedSubtitle.value || undefined,
    maxBitrate: selectedBitrate.value,
  });
}

function handleOriginal() {
  open.value = false;
  emit('original');
}
</script>
