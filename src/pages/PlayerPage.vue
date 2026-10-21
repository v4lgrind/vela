<template>
    <div class="fixed inset-0 bg-black text-white flex flex-col z-[100] h-dvh"
        style="padding: var(--sat, env(safe-area-inset-top, 0px)) var(--sar, env(safe-area-inset-right, 0px)) var(--sab, env(safe-area-inset-bottom, 0px)) var(--sal, env(safe-area-inset-left, 0px))">

        <!-- Error -->
        <section v-if="error"
            class="absolute top-[70px] left-1/2 -translate-x-1/2 z-[200] text-red-400 bg-black/90 px-6 py-3 rounded-lg text-sm">
            {{ error }}
        </section>

        <div class="relative w-full flex-1 overflow-hidden bg-black" @mouseleave="hideControls" @mousemove="showControls">

            <!-- Top bar: back + title — kept reachable during load so the user can escape a stuck load -->
            <div
                :class="controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
                class="absolute top-0 left-0 right-0 z-[60] flex items-center gap-2.5 transition-opacity duration-300 bg-gradient-to-b from-black/70 to-transparent"
                style="padding: calc(12px + var(--sat, env(safe-area-inset-top, 0px))) calc(12px + var(--sar, env(safe-area-inset-right, 0px))) 32px calc(12px + var(--sal, env(safe-area-inset-left, 0px)))">
                <button
                    class="bg-black/40 text-white border-none cursor-pointer p-2 rounded-lg flex items-center transition-colors hover:bg-white/15 shrink-0"
                    @click="goBack" :aria-label="t('common.back')">
                    <ArrowLeft class="size-5" />
                </button>
                <span v-if="mediaTitle" class="text-white text-[0.95rem] font-medium truncate">{{ mediaTitle }}</span>
            </div>

            <!-- Loading overlay -->
            <div v-if="isLoading" class="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
                <Loader2 class="size-15 animate-spin text-accent-purple" />
                <p class="mt-5 text-white text-base font-medium">{{ t('common.loading') }}</p>
            </div>

            <!-- Double-tap seek feedback (web player) -->
            <Transition name="seek-ripple">
                <div v-if="seekFeedback"
                    :key="seekFeedback"
                    class="absolute top-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none z-40 select-none"
                    :class="seekFeedback === 'back' ? 'left-10' : 'right-10'">
                    <span class="text-2xl leading-none font-bold">{{ seekFeedback === 'back' ? '«' : '»' }}</span>
                    <span class="text-xs mt-0.5">{{ seekFeedback === 'back' ? '−10s' : '+10s' }}</span>
                </div>
            </Transition>

            <!-- Video element (web only) -->
            <video v-if="!isNative" ref="videoEl" class="w-full h-full bg-black object-contain" preload="metadata" playsinline
                :poster="posterUrl" @loadstart="onLoadStart" @canplay="onCanPlay"
                @waiting="onWaiting" @playing="onPlaying" @pause="onPause" @timeupdate="onTimeUpdate"
                @loadedmetadata="onLoadedMetadata" @ended="onEnded"
                @click="handleVideoTap"
                @touchstart.passive="handleTouchStart">
                <track
                    v-if="activeTrackBlobUrl"
                    :key="selectedSubtitleIndex ?? -1"
                    kind="subtitles"
                    :srclang="activeTrackLang"
                    :label="activeTrackLabel"
                    :src="activeTrackBlobUrl"
                />
            </video>

            <!-- Center play/pause (web only) -->
            <button v-if="!isNative && !isLoading"
                :class="controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[55] flex items-center justify-center size-[72px] rounded-full bg-black/45 backdrop-blur-sm text-white transition-all duration-300 hover:bg-black/60 active:scale-95"
                @click="togglePlayPause" :aria-label="t('player.playPause')">
                <Play v-if="!isPlaying" class="size-9 fill-current translate-x-0.5" />
                <Pause v-else class="size-9 fill-current" />
            </button>

            <!-- Skip Intro button -->
            <Transition name="skip-intro">
                <button v-if="showSkipIntroButton"
                    class="absolute bottom-32 right-4 z-[60] px-5 py-2.5 bg-accent-purple/85 hover:bg-accent-purple active:bg-accent-purple-light backdrop-blur-sm border border-white/15 text-white text-sm font-semibold rounded-full shadow-lg transition-all cursor-pointer select-none"
                    @click="skipIntro">
                    {{ t('player.skipIntro') }}
                </button>
            </Transition>

            <!-- Bottom controls overlay (auto-hide, web only) -->
            <div v-if="!isNative" class="absolute inset-x-0 bottom-0 flex flex-col justify-end player-gradient transition-opacity duration-300"
                :class="controlsVisible || seekPreview !== null ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
                style="padding-top: 40px; padding-right: calc(16px + env(safe-area-inset-right, 0px)); padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); padding-left: calc(16px + env(safe-area-inset-left, 0px));"
                @click.self="handleVideoTap">

                <!-- The range input owns the entire track, including its unplayed portion. -->
                <input type="range" min="0" :max="duration > 0 ? duration : 1" step="any"
                    :value="seekPreview ?? currentTime" :disabled="!Number.isFinite(duration) || duration <= 0"
                    :style="{ '--seek-progress': `${seekProgress}%` }"
                    class="player-seek w-full h-6 mb-2 cursor-pointer disabled:cursor-default"
                    :aria-label="t('player.position')"
                    :aria-valuetext="`${formatTime(seekPreview ?? currentTime)} of ${formatTime(duration)}`"
                    @pointerdown.prevent="beginSeek" @pointermove="moveSeek" @pointerup="finishSeek"
                    @pointercancel="cancelSeek" @input="previewSeek" @change="commitSeek" />

                <!-- Bottom controls: time (left) + actions (right) -->
                <div class="flex justify-between items-center">
                    <div class="text-[0.9rem] text-white tabular-nums">
                        {{ formatTime(seekPreview ?? currentTime) }} / {{ formatTime(duration) }}
                    </div>

                    <div class="flex items-center gap-1">
                        <!-- Audio track selector (only shown when multiple tracks exist) -->
                        <button v-if="audioList.length > 1"
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                            @click="toggleAudioMenu" :aria-label="t('player.audioTrack')">
                            <AudioLines class="size-6" />
                        </button>

                        <!-- Subtitle track selector (only shown when subtitles exist) -->
                        <button v-if="subtitleList.length > 0"
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                            :class="selectedSubtitleIndex !== null ? 'text-accent-purple' : ''"
                            @click="toggleSubtitleMenu" :aria-label="t('transcode.subtitles')">
                            <Captions class="size-6" />
                        </button>

                        <!-- Quality selector -->
                        <button
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center gap-1.5 transition-colors hover:bg-white/10"
                            @click="toggleQualityMenu" :aria-label="t('player.quality')">
                            <Gauge class="size-6" />
                            <span class="text-[0.9rem] font-medium">{{ currentQualityLabel }}</span>
                        </button>

                        <!-- Stream info -->
                        <button
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                            @click="openInfoModal" :aria-label="t('player.streamInfo')">
                            <Info class="size-6" />
                        </button>

                        <!-- Fullscreen -->
                        <button
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                            @click="toggleFullscreen" :aria-label="t('player.fullscreen')">
                            <Maximize v-if="!isFullscreen" class="size-6" />
                            <Minimize v-else class="size-6" />
                        </button>
                    </div>
                </div>
            </div>

            <!-- Track / quality bottom sheets (web only) -->
            <template v-if="!isNative">
                <PlayerBottomSheet
                    :open="audioMenuOpen"
                    :title="t('player.audioTrack')"
                    :items="audioSheetItems"
                    @select="(k) => switchAudio(Number(k))"
                    @close="audioMenuOpen = false" />

                <PlayerBottomSheet
                    :open="subtitleMenuOpen"
                    :title="t('transcode.subtitles')"
                    :items="subtitleSheetItems"
                    @select="(k) => switchSubtitle(k === 'off' ? null : Number(k))"
                    @close="subtitleMenuOpen = false">
                    <template v-if="selectedSubtitleIndex !== null && !selectedSubtitleIsBurnIn" #footer>
                        <div class="flex items-center justify-between">
                            <span class="text-[0.9rem] text-white/60">{{ t('player.size') }}</span>
                            <div class="flex items-center gap-3">
                                <button class="w-8 h-8 rounded bg-white/10 hover:bg-white/20 text-white text-lg leading-none flex items-center justify-center" @click="adjustSubtitleSize(-0.25)">−</button>
                                <span class="text-[0.9rem] w-10 text-center">{{ Math.round(preferencesStore.subtitleSize * 100) }}%</span>
                                <button class="w-8 h-8 rounded bg-white/10 hover:bg-white/20 text-white text-lg leading-none flex items-center justify-center" @click="adjustSubtitleSize(0.25)">+</button>
                            </div>
                        </div>
                    </template>
                </PlayerBottomSheet>

                <PlayerBottomSheet
                    :open="qualityMenuOpen"
                    :title="t('player.quality')"
                    :items="qualitySheetItems"
                    @select="(k) => switchQuality(Number(k))"
                    @close="qualityMenuOpen = false" />
            </template>
        </div>



        <!-- Stream info modal -->
        <Transition name="info-fade">
            <div v-if="infoModalOpen"
                class="absolute inset-0 z-[150] flex items-center justify-center p-4"
                @click.self="closeInfoModal">
                <div class="bg-[rgba(18,18,18,0.97)] border border-white/10 rounded-2xl p-5 w-full max-w-sm shadow-2xl backdrop-blur-md text-sm"
                    @click.stop>
                    <!-- Header -->
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-base text-white">{{ t('player.streamInfo') }}</h3>
                        <button class="text-white/50 hover:text-white transition-colors p-1" @click="closeInfoModal">✕</button>
                    </div>

                    <!-- Playback method badge + transcode reason -->
                    <div class="flex items-center gap-2 mb-4 flex-wrap">
                        <span class="px-2.5 py-1 rounded-full text-xs font-semibold"
                            :class="{
                                'bg-green-500/20 text-green-400': playMethod === 'DirectPlay',
                                'bg-blue-500/20 text-blue-400': playMethod === 'DirectStream',
                                'bg-accent-purple/20 text-accent-purple': playMethod === 'Transcode',
                            }">
                            {{ playMethod }}
                        </span>
                        <span v-if="liveTranscodingInfo?.TranscodeReasons?.length"
                            class="text-xs text-white/40" :title="liveTranscodingInfo.TranscodeReasons.join(', ')">
                            {{ liveTranscodingInfo.TranscodeReasons[0] }}
                        </span>
                    </div>

                    <!-- Video -->
                    <div v-if="videoStream" class="mb-4">
                        <p class="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">{{ t('player.video') }}</p>
                        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                            <span class="text-white/50">{{ t('transcode.resolution') }}</span>
                            <span class="text-white font-medium">
                                <template v-if="liveTranscodingInfo?.Width != null">{{ liveTranscodingInfo.Width }}×{{ liveTranscodingInfo.Height }} <span class="text-white/40 text-xs">({{ t('player.stream') }})</span></template>
                                <template v-else>{{ videoStream.Width }}×{{ videoStream.Height }} <span class="text-white/40 text-xs">({{ t('player.source') }})</span></template>
                            </span>
                            <span class="text-white/50">{{ t('player.codec') }}</span>
                            <span class="text-white font-medium uppercase">
                                {{ liveTranscodingInfo?.VideoCodec ?? videoStream.Codec }}
                                <span v-if="liveTranscodingInfo" class="text-xs text-white/40 normal-case">
                                    ({{ liveTranscodingInfo.IsVideoDirect ? 'copy' : 'transcoding' }})
                                </span>
                            </span>
                            <span class="text-white/50">{{ t('player.bitrate') }}</span>
                            <span class="text-white font-medium">
                                <template v-if="liveTranscodingInfo?.Bitrate != null">{{ Math.round(liveTranscodingInfo.Bitrate / 1000) }} kbps <span class="text-white/40 text-xs">({{ t('player.stream') }})</span></template>
                                <template v-else-if="videoStream.BitRate">{{ Math.round(videoStream.BitRate / 1000) }} kbps <span class="text-white/40 text-xs">({{ t('player.source') }})</span></template>
                                <template v-else>—</template>
                            </span>
                            <template v-if="liveTranscodingInfo && !liveTranscodingInfo.IsVideoDirect">
                                <span class="text-white/50">{{ t('player.encodeSpeed') }}</span>
                                <span class="text-white font-medium">{{ liveTranscodingInfo.Framerate?.toFixed(1) ?? '—' }} fps</span>
                            </template>
                            <template v-else>
                                <span class="text-white/50">{{ t('player.frameRate') }}</span>
                                <span class="text-white font-medium">{{ videoStream.RealFrameRate?.toFixed(2) ?? videoStream.AverageFrameRate?.toFixed(2) ?? '—' }} fps</span>
                            </template>
                        </div>
                    </div>

                    <!-- Audio -->
                    <div v-if="activeAudioStream">
                        <p class="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">{{ t('types.Audio') }}</p>
                        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                            <span class="text-white/50">{{ t('player.codec') }}</span>
                            <span class="text-white font-medium uppercase">
                                {{ liveTranscodingInfo?.AudioCodec ?? activeAudioStream.Codec }}
                                <span v-if="liveTranscodingInfo" class="text-xs text-white/40 normal-case">
                                    ({{ liveTranscodingInfo.IsAudioDirect ? 'copy' : 'transcoding' }})
                                </span>
                            </span>
                            <span class="text-white/50">{{ t('player.channels') }}</span>
                            <span class="text-white font-medium">{{ activeAudioStream.ChannelLayout ?? (activeAudioStream.Channels + 'ch') }}</span>
                            <span class="text-white/50">{{ t('player.bitrate') }}</span>
                            <span class="text-white font-medium">{{ activeAudioStream.BitRate ? Math.round(activeAudioStream.BitRate / 1000) + ' kbps' : '—' }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
// Orchestrates the player page. All playback logic lives in the composables
// under src/composables/player/:
//   usePlayerSession  — shared state + Jellyfin session API/reporting
//   usePlayerControls — controls overlay, menus, tap gestures
//   useSkipIntro      — intro/outro segments + Skip Intro button
//   useStreamInfo     — Stream Info modal + live transcoding info
//   useWebPlayer      — web <video>/HLS.js path
//   useNativePlayer   — Android ExoPlayer path
//   useOfflinePlayer  — downloaded-file playback path
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { useOfflineStore } from '@/store/offline-store';
import { offlineDatabase } from '@/services/offlineDatabase';
import { NativeVideo } from '@/plugins/NativeVideoPlugin';
import { usePlatform } from '@/composables/usePlatform';
import { usePlayerSession } from '@/composables/player/usePlayerSession';
import { usePlayerControls } from '@/composables/player/usePlayerControls';
import { useSkipIntro } from '@/composables/player/useSkipIntro';
import { useStreamInfo } from '@/composables/player/useStreamInfo';
import { useWebPlayer } from '@/composables/player/useWebPlayer';
import { useNativePlayer } from '@/composables/player/useNativePlayer';
import { useOfflinePlayer } from '@/composables/player/useOfflinePlayer';
import { pickPreferredAudioStream } from '@/utils/audioTrackSelection';
import { getDeviceCapabilities } from '@/utils/codecDetection';
import { formatTime } from '@/utils/helpers';
import { buildMediaTitle } from '@/utils/mediaTitle';
import { lockLandscape, unlockOrientation } from '@/utils/orientation';
import { logger } from '@/utils/logger';
import { isBurnInSubtitleStream, parseSavedBurnInSubtitleIndex } from '@/utils/subtitleTracks';
import { ArrowLeft, Play, Pause, AudioLines, Captions, Gauge, Info, Maximize, Minimize, Loader2 } from 'lucide-vue-next';
import PlayerBottomSheet from '@/components/PlayerBottomSheet.vue';

const route = useRoute();
const { t } = useI18n();
const router = useRouter();
const store = useJellyfinStore();
const audioPlayerStore = useAudioPlayerStore();
const preferencesStore = usePreferencesStore();
const offlineStore = useOfflineStore();
const { isNative } = usePlatform();

const videoEl = ref<HTMLVideoElement | null>(null);

// ── Composables ────────────────────────────────────────────────────────────────

const session = usePlayerSession(videoEl, isNative);
const {
    itemId,
    isLoading, isPlaying, currentTime, duration, error, mediaTitle,
    playMethod, audioList, selectedAudioIndex, subtitleList, selectedSubtitleIndex,
    activeBurnInSubtitleIndex,
    selectedBitrate, availablePresets, currentQualityLabel,
    videoStream, activeAudioStream, posterUrl, isOfflinePlayback,
} = session;

const controls = usePlayerControls({
    onTogglePlayPause: () => webPlayer.togglePlayPause(),
    onDoubleTapSeek: (deltaSec) => webPlayer.doubleTapSeek(deltaSec),
});
const {
    controlsVisible, audioMenuOpen, subtitleMenuOpen, qualityMenuOpen, seekFeedback,
    showControls, hideControls, handleVideoTap, handleTouchStart, handleKeyDown,
    toggleAudioMenu, toggleSubtitleMenu, toggleQualityMenu,
} = controls;

const skipIntroCtl = useSkipIntro(session, videoEl, isNative);
const { showSkipIntroButton, skipIntro, fetchIntroTimestamps } = skipIntroCtl;

const streamInfo = useStreamInfo(session);
const { infoModalOpen, liveTranscodingInfo, closeInfoModal } = streamInfo;

const webPlayer = useWebPlayer(session, controls, videoEl, isNative);
const {
    activeTrackBlobUrl, activeTrackLang, activeTrackLabel, isFullscreen,
    onLoadStart, onCanPlay, onWaiting, onPlaying, onPause, onTimeUpdate, onLoadedMetadata, onEnded,
    onFullscreenChange, togglePlayPause, seek, toggleFullscreen,
    switchSubtitle, adjustSubtitleSize, switchAudio, switchQuality,
} = webPlayer;

const nativePlayer = useNativePlayer(session, streamInfo, skipIntroCtl);
const offlinePlayer = useOfflinePlayer(session, skipIntroCtl, videoEl, isNative);

// ── Bottom-sheet item lists (shared PlayerBottomSheet component) ────────────────

const audioSheetItems = computed(() =>
    audioList.value.map(o => ({ key: o.index, label: o.label, selected: o.index === selectedAudioIndex.value }))
);
const subtitleSheetItems = computed(() => [
    { key: 'off', label: t('settings.lang.off'), selected: selectedSubtitleIndex.value === null },
    ...subtitleList.value.map(s => ({ key: s.index, label: s.label, selected: s.index === selectedSubtitleIndex.value })),
]);
const selectedSubtitleIsBurnIn = computed(() =>
    subtitleList.value.some(track =>
        track.index === selectedSubtitleIndex.value && track.playbackMode === 'burn-in'
    )
);
const qualitySheetItems = computed(() =>
    availablePresets.value.map(p => ({ key: p.bitrate, label: p.label, selected: p.bitrate === selectedBitrate.value }))
);
// Keep the user's drag position visible until the range commits on release.
const seekPreview = ref<number | null>(null);
const seekProgress = computed(() => duration.value > 0 && Number.isFinite(duration.value)
    ? Math.max(0, Math.min(100, ((seekPreview.value ?? currentTime.value) / duration.value) * 100))
    : 0
);

// Pointer gestures scrub relative to the current position; a simple tap still
// jumps to the tapped time. Native range input keyboard events remain intact.
let seekPointer: { id: number; x: number; time: number; moved: boolean } | null = null;

function beginSeek(event: PointerEvent) {
    if (event.button !== 0 || seekPointer) return;
    seekPointer = { id: event.pointerId, x: event.clientX, time: currentTime.value, moved: false };
    seekPreview.value = currentTime.value;
    (event.currentTarget as HTMLInputElement).setPointerCapture(event.pointerId);
    showControls();
}

function relativeSeek(event: PointerEvent): number {
    const slider = event.currentTarget as HTMLInputElement;
    // Account for the 16px thumb, whose centre stops short of the track edges.
    const width = Math.max(1, slider.getBoundingClientRect().width - 16);
    return Math.max(0, Math.min(duration.value, seekPointer!.time + (event.clientX - seekPointer!.x) / width * duration.value));
}

function moveSeek(event: PointerEvent) {
    if (seekPointer?.id !== event.pointerId) return;
    if (Math.abs(event.clientX - seekPointer.x) >= 5) seekPointer.moved = true;
    if (seekPointer.moved) seekPreview.value = relativeSeek(event);
}

function finishSeek(event: PointerEvent) {
    if (seekPointer?.id !== event.pointerId) return;
    const slider = event.currentTarget as HTMLInputElement;
    const rect = slider.getBoundingClientRect();
    const width = Math.max(1, rect.width - 16);
    const position = seekPointer.moved
        ? relativeSeek(event)
        : Math.max(0, Math.min(duration.value, (event.clientX - rect.left - 8) / width * duration.value));
    seekPointer = null;
    seek(position);
    seekPreview.value = null;
    showControls();
}

function previewSeek(event: Event) {
    seekPreview.value = Number((event.target as HTMLInputElement).value);
    showControls();
}

function commitSeek(event: Event) {
    if (seekPointer) return;
    seek(Number((event.target as HTMLInputElement).value));
    seekPreview.value = null;
    showControls();
}

function cancelSeek(event: PointerEvent) {
    if (seekPointer?.id !== event.pointerId) return;
    seekPointer = null;
    seekPreview.value = null;
    showControls();
}


function openInfoModal() {
    streamInfo.openInfoModal();
    showControls();
}

function goBack() { router.back(); }

function resolveInitialBurnInSubtitleIndex(streams: any[]): number | null {
    const preferenceKey = isNative
        ? `msplayer-subtitle-native-${itemId}`
        : `msplayer-subtitle-${itemId}`;
    const savedValue = localStorage.getItem(preferenceKey);
    const savedIndex = parseSavedBurnInSubtitleIndex(savedValue);
    const savedTrack = savedIndex === null
        ? null
        : streams.find(stream => stream.Index === savedIndex && isBurnInSubtitleStream(stream));

    if (savedTrack) return savedTrack.Index;
    if (savedValue !== null) return null;

    const preferredLanguage = preferencesStore.preferredSubtitleLanguage;
    if (!preferredLanguage) return null;
    const preferredTrack = streams.find(stream =>
        isBurnInSubtitleStream(stream) && stream.Language === preferredLanguage
    );
    return preferredTrack?.Index ?? null;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(async () => {
    // Music and video never coexist: a video closes the music player, paused or not.
    if (audioPlayerStore.isMiniPlayerVisible) audioPlayerStore.stop();
    lockLandscape();

    // If offline and item is downloaded, bypass all Jellyfin network calls.
    const cachedDownload = offlineStore.getDownload(itemId);
    const isOffline = !offlineStore.isFullyOnline || preferencesStore.forceOfflineMode;
    if (isOffline && cachedDownload) {
        const routeStartTicks = route.query.startTicks ? Number(route.query.startTicks) : null;

        // For offline playback, always check offline database first (most recent progress),
        // then fall back to route startTicks or cached Jellyfin position.
        let resumeSeconds: number | undefined;
        const offlineProgress = await offlineDatabase.getWatchProgress(itemId);
        if (offlineProgress && offlineProgress.position > 0 && !offlineProgress.completed) {
            resumeSeconds = offlineProgress.position;
        } else if (routeStartTicks) {
            resumeSeconds = routeStartTicks / 10_000_000;
        } else {
            const cachedTicks = cachedDownload.jellyfinItem?.UserData?.PlaybackPositionTicks;
            resumeSeconds = cachedTicks ? cachedTicks / 10_000_000 : undefined;
        }

        mediaTitle.value = buildMediaTitle(cachedDownload.jellyfinItem);
        await offlinePlayer.initOfflinePlayer(cachedDownload, resumeSeconds, mediaTitle.value);
        if (!isNative) {
            document.addEventListener('fullscreenchange', onFullscreenChange);
            document.addEventListener('webkitfullscreenchange', onFullscreenChange);
            document.addEventListener('keydown', handleKeyDown);
        }
        return;
    }

    // Always fetch fresh details — cached currentItem may have stale PlaybackPositionTicks
    let details: any = null;
    try {
        details = await store.fetchItemDetails(itemId);
    } catch (e) {
        logger.warn('[Player] Failed to load item details:', e);
    }
    mediaTitle.value = buildMediaTitle(details);

    // Prefer ticks passed through the route query (set by the calling page which has live data).
    // Fall back to Jellyfin's stored value only if no route ticks are present.
    const routeStartTicks = route.query.startTicks ? Number(route.query.startTicks) : null;
    const resumeTicks = routeStartTicks ?? details?.UserData?.PlaybackPositionTicks;
    const resumeSeconds = resumeTicks ? resumeTicks / 10_000_000 : undefined;

    // Determine preferred audio: saved user choice → global preferred lang → marked default → first track.
    const allStreams: any[] = details?.MediaStreams || [];

    // Restore a saved/global bitmap subtitle before PlaybackInfo negotiation so
    // Jellyfin returns a video stream with the subtitle burned in from the start.
    activeBurnInSubtitleIndex.value = resolveInitialBurnInSubtitleIndex(allStreams);

    // Within the preferred language, prefer the track this device decodes best.
    const audioStreams = allStreams.filter(s => s.Type === 'Audio');
    const preferred = pickPreferredAudioStream(
        audioStreams,
        [localStorage.getItem(`msplayer-audio-${itemId}`), preferencesStore.preferredAudioLanguage],
        await getDeviceCapabilities(),
    );
    const preferredAudioIndex: number | undefined = preferred?.Index;

    if (isNative) {
        const { forceTranscodeAudio, forceTranscodeVideo, stripHevc } =
            await nativePlayer.detectCodecFallbacks(allStreams, preferred);
        const chapters = (details?.Chapters || []).map((ch: any) => ({
            name: ch.Name || '',
            startMs: Math.floor((ch.StartPositionTicks || 0) / 10_000),
        }));
        await nativePlayer.initNativePlayer(resumeSeconds, preferredAudioIndex, buildMediaTitle(details), forceTranscodeAudio, forceTranscodeVideo, chapters, stripHevc);
    } else {
        await webPlayer.initPlayer(
            resumeSeconds,
            preferredAudioIndex,
            activeBurnInSubtitleIndex.value ?? undefined,
        );
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);
        document.addEventListener('keydown', handleKeyDown);
    }

    fetchIntroTimestamps();
});

onBeforeUnmount(() => {
    unlockOrientation();
    // Resume position / next-up changed: home refetches behind its snapshot.
    store.markHomeCacheStale();

    if (isNative) {
        // Save progress BEFORE removing listeners or stopping
        if (isOfflinePlayback.value) {
            offlinePlayer.saveOfflineProgress();
        } else {
            session.reportPlaybackStopped();
            session.deleteActiveEncodings();
        }
        NativeVideo.removeAllListeners();
        NativeVideo.stop().catch(() => {});
        return;
    }

    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    document.removeEventListener('keydown', handleKeyDown);

    controls.dispose();
    streamInfo.stopPolling();
    offlinePlayer.dispose();
    if (isOfflinePlayback.value) {
        offlinePlayer.saveOfflineProgress();
    } else {
        session.stopProgressReporting();
        session.deleteActiveEncodings();
    }

    webPlayer.dispose();
});
</script>

<style scoped>
.player-seek {
    appearance: none;
    -webkit-appearance: none;
    display: block;
    margin-left: 0;
    margin-right: 0;
    padding: 0;
    background: transparent;
    touch-action: none;
}
.player-seek::-webkit-slider-runnable-track {
    height: 5px;
    border-radius: 999px;
    background: linear-gradient(to right, var(--color-accent-purple) var(--seek-progress), rgb(255 255 255 / 30%) var(--seek-progress));
}
.player-seek::-moz-range-track {
    height: 5px;
    border-radius: 999px;
    background: linear-gradient(to right, var(--color-accent-purple) var(--seek-progress), rgb(255 255 255 / 30%) var(--seek-progress));
}
.player-seek::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -5.5px;
    border: 0;
    border-radius: 50%;
    background: var(--color-accent-purple);
    box-shadow: 0 0 0 2px rgb(0 0 0 / 35%);
}
.player-seek::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: 0;
    border-radius: 50%;
    background: var(--color-accent-purple);
    box-shadow: 0 0 0 2px rgb(0 0 0 / 35%);
}
.player-seek:focus-visible {
    outline: 2px solid var(--color-accent-purple-light);
    outline-offset: 2px;
    border-radius: 4px;
}
.player-gradient {
    background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 40%);
}
.info-fade-enter-active,
.info-fade-leave-active {
    transition: opacity 150ms ease;
}
.info-fade-enter-from,
.info-fade-leave-to {
    opacity: 0;
}

.skip-intro-enter-active,
.skip-intro-leave-active {
    transition: opacity 300ms ease, transform 300ms ease;
}
.skip-intro-enter-from,
.skip-intro-leave-to {
    opacity: 0;
    transform: translateY(8px);
}

.seek-ripple-enter-active {
    transition: opacity 100ms ease, transform 100ms ease;
}
.seek-ripple-leave-active {
    transition: opacity 350ms ease;
}
.seek-ripple-enter-from {
    opacity: 0;
    transform: translateY(-50%) scale(0.6);
}
.seek-ripple-leave-to {
    opacity: 0;
}
</style>

<style>
video::cue {
    background-color: transparent;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.7);
}
</style>
