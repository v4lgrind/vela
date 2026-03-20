<template>
    <div class="fixed inset-0 bg-black text-white flex flex-col z-[100] h-dvh"
        style="padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)">

        <!-- Error -->
        <section v-if="error"
            class="absolute top-[70px] left-1/2 -translate-x-1/2 z-[200] text-red-400 bg-black/90 px-6 py-3 rounded-lg text-sm">
            {{ error }}
        </section>

        <div class="relative w-full flex-1 overflow-hidden bg-black" @mouseleave="hideControls" @mousemove="showControls">

            <!-- Back button — always visible above loader so user can escape a stuck load -->
            <button
                :class="controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
                class="absolute bg-black/50 text-white border-none cursor-pointer px-3.5 py-2 rounded-lg flex items-center gap-1.5 text-[0.95rem] font-medium transition-colors hover:bg-white/15 z-[60]"
                style="top: calc(12px + env(safe-area-inset-top, 0px)); left: calc(12px + env(safe-area-inset-left, 0px))" @click="goBack">
                <ArrowLeft class="size-5" />
                Back
            </button>

            <!-- Loading overlay -->
            <div v-if="isLoading" class="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
                <Loader2 class="size-15 animate-spin text-accent-purple" />
                <p class="mt-5 text-white text-base font-medium">Loading...</p>
            </div>

            <!-- Video element (web only) -->
            <video v-if="!isNative" ref="videoEl" class="w-full h-full bg-black object-contain" preload="metadata" playsinline
                :poster="posterUrl" @loadstart="onLoadStart" @canplay="onCanPlay"
                @waiting="onWaiting" @playing="onPlaying" @pause="onPause" @timeupdate="onTimeUpdate"
                @loadedmetadata="onLoadedMetadata" @ended="onEnded"
                @click="handleVideoTap"
                @touchstart="handleVideoTap">
                <track
                    v-if="activeTrackBlobUrl"
                    :key="selectedSubtitleIndex ?? -1"
                    kind="subtitles"
                    :srclang="activeTrackLang"
                    :label="activeTrackLabel"
                    :src="activeTrackBlobUrl"
                />
            </video>

            <!-- Skip Intro button -->
            <Transition name="skip-intro">
                <button v-if="showSkipIntroButton"
                    class="absolute bottom-32 right-4 z-[60] px-5 py-2.5 bg-black/60 hover:bg-black/80 active:bg-black/90 backdrop-blur-sm border border-white/30 hover:border-white/60 text-white text-sm font-semibold rounded-lg transition-all cursor-pointer select-none"
                    @click="skipIntro">
                    Skip Intro
                </button>
            </Transition>

            <!-- Controls overlay (auto-hide, web only) -->
            <div v-if="!isNative" class="absolute inset-0 flex flex-col justify-end player-gradient transition-opacity duration-300"
                :class="controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
                style="padding-top: 20px; padding-right: calc(16px + env(safe-area-inset-right, 0px)); padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); padding-left: calc(16px + env(safe-area-inset-left, 0px));"
                @click.self="handleVideoTap">

                <!-- Progress bar -->
                <div class="w-full h-6 flex items-center cursor-pointer mb-3 group active:brightness-90" @click="seek">
                    <div
                        class="w-full h-1 bg-white/30 rounded-sm relative transition-[height] duration-200 group-hover:h-1.5">
                        <div class="h-full bg-accent-purple rounded-sm transition-[width] duration-100 ease-linear"
                            :style="{ width: progressPct + '%' }"></div>
                    </div>
                </div>

                <!-- Bottom controls -->
                <div class="flex justify-between items-center">
                    <!-- Left: play/pause, mute, time -->
                    <div class="flex items-center gap-2">
                        <button
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                            @click="togglePlayPause">
                            <Play v-if="!isPlaying" class="size-6 fill-current" />
                            <Pause v-else class="size-6 fill-current" />
                        </button>

                        <button
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                            @click="toggleMute">
                            <VolumeX v-if="isMuted" class="size-6" />
                            <Volume2 v-else class="size-6" />
                        </button>

                        <div class="text-[0.9rem] text-white tabular-nums min-w-[110px]">
                            {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
                        </div>
                    </div>

                    <!-- Right: audio selector, fullscreen -->
                    <div class="flex items-center gap-2">
                        <!-- Audio track selector (only shown when multiple tracks exist) -->
                        <div v-if="audioList.length > 1" class="relative" ref="audioDropdown">
                            <button
                                class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center gap-1.5 transition-colors hover:bg-white/10"
                                @click="toggleAudioMenu">
                                <AudioLines class="size-6" />
                            </button>
                            <div class="absolute bottom-full right-0 mb-2 bg-[rgba(28,28,28,0.98)] rounded-lg min-w-[250px] max-h-[400px] overflow-y-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-all duration-200 scrollbar-hide"
                                :class="audioMenuOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-2.5'">
                                <div v-for="opt in audioList" :key="opt.index"
                                    class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10 active:opacity-75"
                                    :class="opt.index === selectedAudioIndex ? 'bg-accent-purple/20' : ''"
                                    @click="switchAudio(opt.index)">
                                    <Check class="size-4 shrink-0"
                                        :class="opt.index === selectedAudioIndex ? 'opacity-100' : 'opacity-0'" />
                                    {{ opt.label }}
                                </div>
                            </div>
                        </div>

                        <!-- Subtitle track selector (only shown when subtitles exist) -->
                        <div v-if="subtitleList.length > 0" class="relative" ref="subtitleDropdown">
                            <button
                                class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center gap-1.5 transition-colors hover:bg-white/10"
                                @click="toggleSubtitleMenu">
                                <Captions class="size-6" />
                            </button>
                            <div class="absolute bottom-full right-0 mb-2 bg-[rgba(28,28,28,0.98)] rounded-lg min-w-[250px] max-h-[400px] overflow-y-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-all duration-200 scrollbar-hide"
                                :class="subtitleMenuOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-2.5'">
                                <!-- Off -->
                                <div
                                    class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10 active:opacity-75"
                                    :class="selectedSubtitleIndex === null ? 'bg-accent-purple/20' : ''"
                                    @click="switchSubtitle(null)">
                                    <Check class="size-4 shrink-0"
                                        :class="selectedSubtitleIndex === null ? 'opacity-100' : 'opacity-0'" />
                                    Off
                                </div>
                                <div v-for="sub in subtitleList" :key="sub.index"
                                    class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10 active:opacity-75"
                                    :class="sub.index === selectedSubtitleIndex ? 'bg-accent-purple/20' : ''"
                                    @click="switchSubtitle(sub.index)">
                                    <Check class="size-4 shrink-0"
                                        :class="sub.index === selectedSubtitleIndex ? 'opacity-100' : 'opacity-0'" />
                                    {{ sub.label }}
                                </div>
                            </div>
                        </div>

                        <!-- Quality selector -->
                        <div class="relative" ref="qualityDropdown">
                            <button
                                class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center gap-1.5 transition-colors hover:bg-white/10"
                                @click="toggleQualityMenu">
                                <Gauge class="size-6" />
                                <span class="text-[0.9rem] font-medium">{{ currentQualityLabel }}</span>
                            </button>
                            <div class="absolute bottom-full right-0 mb-2 bg-[rgba(28,28,28,0.98)] rounded-lg min-w-[160px] overflow-y-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-all duration-200"
                                :class="qualityMenuOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-2.5'">
                                <div v-for="preset in availablePresets" :key="preset.bitrate"
                                    class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10 active:opacity-75"
                                    :class="preset.bitrate === selectedBitrate ? 'bg-accent-purple/20' : ''"
                                    @click="switchQuality(preset.bitrate)">
                                    <Check class="size-4 shrink-0"
                                        :class="preset.bitrate === selectedBitrate ? 'opacity-100' : 'opacity-0'" />
                                    {{ preset.label }}
                                </div>
                            </div>
                        </div>

                        <!-- Stream info -->
                        <button
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                            @click="openInfoModal" title="Stream info">
                            <Info class="size-6" />
                        </button>

                        <!-- Fullscreen -->
                        <button
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                            @click="toggleFullscreen">
                            <Maximize v-if="!isFullscreen" class="size-6" />
                            <Minimize v-else class="size-6" />
                        </button>
                    </div>
                </div>
            </div>
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
                        <h3 class="font-semibold text-base text-white">Stream Info</h3>
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
                        <p class="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">Video</p>
                        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                            <span class="text-white/50">Resolution</span>
                            <span class="text-white font-medium">
                                <template v-if="liveTranscodingInfo?.Width != null">{{ liveTranscodingInfo.Width }}×{{ liveTranscodingInfo.Height }} <span class="text-white/40 text-xs">(stream)</span></template>
                                <template v-else>{{ videoStream.Width }}×{{ videoStream.Height }} <span class="text-white/40 text-xs">(source)</span></template>
                            </span>
                            <span class="text-white/50">Codec</span>
                            <span class="text-white font-medium uppercase">
                                {{ liveTranscodingInfo?.VideoCodec ?? videoStream.Codec }}
                                <span v-if="liveTranscodingInfo" class="text-xs text-white/40 normal-case">
                                    ({{ liveTranscodingInfo.IsVideoDirect ? 'copy' : 'transcoding' }})
                                </span>
                            </span>
                            <span class="text-white/50">Bitrate</span>
                            <span class="text-white font-medium">
                                <template v-if="liveTranscodingInfo?.Bitrate != null">{{ Math.round(liveTranscodingInfo.Bitrate / 1000) }} kbps <span class="text-white/40 text-xs">(stream)</span></template>
                                <template v-else-if="videoStream.BitRate">{{ Math.round(videoStream.BitRate / 1000) }} kbps <span class="text-white/40 text-xs">(source)</span></template>
                                <template v-else>—</template>
                            </span>
                            <template v-if="liveTranscodingInfo && !liveTranscodingInfo.IsVideoDirect">
                                <span class="text-white/50">Encode speed</span>
                                <span class="text-white font-medium">{{ liveTranscodingInfo.Framerate?.toFixed(1) ?? '—' }} fps</span>
                            </template>
                            <template v-else>
                                <span class="text-white/50">Frame rate</span>
                                <span class="text-white font-medium">{{ videoStream.RealFrameRate?.toFixed(2) ?? videoStream.AverageFrameRate?.toFixed(2) ?? '—' }} fps</span>
                            </template>
                        </div>
                    </div>

                    <!-- Audio -->
                    <div v-if="activeAudioStream">
                        <p class="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">Audio</p>
                        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                            <span class="text-white/50">Codec</span>
                            <span class="text-white font-medium uppercase">
                                {{ liveTranscodingInfo?.AudioCodec ?? activeAudioStream.Codec }}
                                <span v-if="liveTranscodingInfo" class="text-xs text-white/40 normal-case">
                                    ({{ liveTranscodingInfo.IsAudioDirect ? 'copy' : 'transcoding' }})
                                </span>
                            </span>
                            <span class="text-white/50">Channels</span>
                            <span class="text-white font-medium">{{ activeAudioStream.ChannelLayout ?? (activeAudioStream.Channels + 'ch') }}</span>
                            <span class="text-white/50">Bitrate</span>
                            <span class="text-white font-medium">{{ activeAudioStream.BitRate ? Math.round(activeAudioStream.BitRate / 1000) + ' kbps' : '—' }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { useOfflineStore } from '@/store/offline-store';
import { offlineDatabase } from '@/services/offlineDatabase';
import { Filesystem, Directory } from '@capacitor/filesystem';
import Hls from 'hls.js';
import { Capacitor } from '@capacitor/core';
import { NativeVideo } from '@/plugins/NativeVideoPlugin';
import { deviceProfile, nativeAndroidDeviceProfile } from '@/constants';
import { formatTime } from '@/utils/helpers';
import { lockLandscape, unlockOrientation } from '@/utils/orientation';
import { debugLog } from '@/utils/debugLog';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, AudioLines, Captions, Gauge, Info, Check, Maximize, Minimize, Loader2 } from 'lucide-vue-next';

// ── Setup ──────────────────────────────────────────────────────────────────────

const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const audioPlayerStore = useAudioPlayerStore();
const preferencesStore = usePreferencesStore();
const offlineStore = useOfflineStore();

const itemId = route.params.id as string;
const accessToken = store.accessToken || '';
const serverUrl = store.serverUrl;
const isNative = Capacitor.isNativePlatform();

// Stable per-browser device ID so Jellyfin can match DELETE /Videos/ActiveEncodings
// to the session we created. Without it, Jellyfin can't kill the FFmpeg job on demand.
function getDeviceId(): string {
    let id = localStorage.getItem('msplayer-device-id');
    if (!id) {
        id = `browser-${Math.random().toString(36).slice(2, 15)}`;
        localStorage.setItem('msplayer-device-id', id);
    }
    return id;
}
const deviceId = getDeviceId();
const embyAuthHeader = `MediaBrowser Client="MediaServerClient", Device="Browser", DeviceId="${deviceId}", Version="1.0.0", Token="${accessToken}"`;
const reportingHeaders = { 'Content-Type': 'application/json', 'Authorization': embyAuthHeader };

// ── Refs ──────────────────────────────────────────────────────────────────────

const videoEl = ref<HTMLVideoElement | null>(null);
const audioDropdown = ref<HTMLElement | null>(null);
const subtitleDropdown = ref<HTMLElement | null>(null);

const isLoading = ref(true);
const isPlaying = ref(false);
const isMuted = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const progressPct = ref(0);
const isFullscreen = ref(false);
const controlsVisible = ref(true);
const error = ref<string | null>(null);

// Jellyfin session
const playSessionId = ref('');
const mediaSource = ref<any>(null);
const hlsUrl = ref('');
const playMethod = ref<'DirectPlay' | 'DirectStream' | 'Transcode'>('Transcode');

// Audio tracks
const audioList = ref<Array<{ index: number; label: string; language: string }>>([]);
const selectedAudioIndex = ref<number | null>(null);
const audioMenuOpen = ref(false);

// Subtitle tracks
const subtitleList = ref<Array<{ index: number; label: string; language: string; deliveryUrl: string }>>([]);
const selectedSubtitleIndex = ref<number | null>(null); // null = off
const subtitleMenuOpen = ref(false);

// Active track — blob: URL so the browser never hits the cross-origin <track> restriction
const activeTrackBlobUrl = ref<string | null>(null);
const activeTrackLang = ref('und');
const activeTrackLabel = ref('');
const subtitleBlobCache = new Map<number, string>(); // index → blob URL

// Quality / bitrate
const ALL_QUALITY_PRESETS = [
    { label: 'Auto',     bitrate: 0,          minHeight: 0    },
    { label: '4K',      bitrate: 80_000_000, minHeight: 2160 },
    { label: '1080p',   bitrate: 20_000_000, minHeight: 1080 },
    { label: '720p',    bitrate:  8_000_000, minHeight: 720  },
    { label: '480p',    bitrate:  3_000_000, minHeight: 480  },
    { label: '360p',    bitrate:  1_500_000, minHeight: 360  },
];
const selectedBitrate = ref(preferencesStore.preferredBitrate); // 0 = Auto (unlimited)
const qualityMenuOpen = ref(false);
let nativeSwitchingQuality = false; // suppress 'stopped' → router.back() during native quality switch
const qualityDropdown = ref<HTMLElement | null>(null);
const qualityDropdownNative = ref<HTMLElement | null>(null);
// Only show presets that make sense for the source resolution
const availablePresets = computed(() => {
    const sourceHeight = videoStream.value?.Height ?? 0;
    if (!sourceHeight) return ALL_QUALITY_PRESETS;
    return ALL_QUALITY_PRESETS.filter(p => p.minHeight === 0 || p.minHeight <= sourceHeight);
});
const currentQualityLabel = computed(() =>
    ALL_QUALITY_PRESETS.find(p => p.bitrate === selectedBitrate.value)?.label ?? 'Auto'
);

// Stream info modal
const infoModalOpen = ref(false);
const liveTranscodingInfo = ref<any>(null);
let infoPollingInterval: ReturnType<typeof setInterval> | null = null;

const videoStream = computed(() =>
    (mediaSource.value?.MediaStreams ?? []).find((s: any) => s.Type === 'Video')
);
const activeAudioStream = computed(() =>
    (mediaSource.value?.MediaStreams ?? []).find((s: any) => s.Type === 'Audio' && s.Index === selectedAudioIndex.value)
    ?? (mediaSource.value?.MediaStreams ?? []).find((s: any) => s.Type === 'Audio')
);

const posterUrl = computed(() => store.getImageUrl(itemId, 'Primary') || '');

// Intro skip
const introEnd = ref<number | null>(null);
const skipPromptStart = ref<number | null>(null);
const skipPromptEnd = ref<number | null>(null);
const introSkipped = ref(false);
const nativeResumeOffsetMs = ref(0);
const showSkipIntroButton = computed(() => {
    if (introSkipped.value) return false;
    if (skipPromptStart.value === null || skipPromptEnd.value === null) return false;
    return currentTime.value >= skipPromptStart.value && currentTime.value <= skipPromptEnd.value;
});

// Reset introSkipped when user seeks back into or before the intro window
watch(currentTime, (t) => {
    if (introSkipped.value && skipPromptEnd.value !== null && t < skipPromptEnd.value) {
        introSkipped.value = false;
    }
});

let hls: Hls | null = null;
let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
let progressInterval: ReturnType<typeof setInterval> | null = null;
let offlineProgressInterval: ReturnType<typeof setInterval> | null = null;
let isSwitching = false;
let isOfflinePlayback = false;

// ── Video event handlers ───────────────────────────────────────────────────────

function onLoadStart() { isLoading.value = true; }
function onCanPlay() { isLoading.value = false; }
function onWaiting() { isLoading.value = true; }
function onPlaying() { isLoading.value = false; isPlaying.value = true; }
function onPause() { isPlaying.value = false; }

function onTimeUpdate() {
    const video = videoEl.value;
    if (!video) return;
    currentTime.value = video.currentTime;
    if (duration.value > 0) progressPct.value = (currentTime.value / duration.value) * 100;
}

function onLoadedMetadata() {
    const video = videoEl.value;
    if (!video) return;
    duration.value = video.duration;
    isMuted.value = video.muted;
}

function onEnded() {
    isPlaying.value = false;
    stopProgressReporting();
}

// ── Controls visibility ────────────────────────────────────────────────────────

function showControls() {
    controlsVisible.value = true;
    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        if (!audioMenuOpen.value && !subtitleMenuOpen.value) controlsVisible.value = false;
    }, 3000);
}

function hideControls() {
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (!audioMenuOpen.value && !subtitleMenuOpen.value) {
        controlsTimeout = setTimeout(() => { controlsVisible.value = false; }, 1000);
    }
}

function handleVideoTap() {
    const isTouchDevice = navigator.maxTouchPoints > 0 && window.innerWidth < 1024;
    if (isTouchDevice) {
        if (controlsVisible.value == true) {
            hideControls();
        } else {
            showControls();
        }
    } else {
        togglePlayPause();
    }
}

// ── Playback controls ──────────────────────────────────────────────────────────

function togglePlayPause() {
    const video = videoEl.value;
    if (!video) return;
    if (video.paused) {
        video.play().then(() => { if (!isOfflinePlayback) reportPlaybackProgress(); });
    } else {
        video.pause();
        if (!isOfflinePlayback) reportPlaybackProgress();
    }
}

function toggleMute() {
    const video = videoEl.value;
    if (!video) return;
    video.muted = !video.muted;
    isMuted.value = video.muted;
}

function seek(e: MouseEvent) {
    const bar = e.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const video = videoEl.value;
    if (!video || !duration.value) return;
    video.currentTime = Math.max(0, ratio * duration.value);
    if (!isOfflinePlayback) reportPlaybackProgress();
}

function requestFS(el: HTMLElement) {
    if (el.requestFullscreen) return el.requestFullscreen();
    if ((el as any).webkitRequestFullscreen) return (el as any).webkitRequestFullscreen();
    if ((el as any).webkitEnterFullscreen) return (el as any).webkitEnterFullscreen();
    return Promise.reject();
}

function exitFS() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if ((document as any).webkitExitFullscreen) return (document as any).webkitExitFullscreen();
    return Promise.reject();
}

function getFullscreenElement() {
    return document.fullscreenElement || (document as any).webkitFullscreenElement || null;
}

function toggleFullscreen() {
    const container = videoEl.value?.parentElement;
    if (!container) return;
    if (!getFullscreenElement()) {
        requestFS(container).then(() => { isFullscreen.value = true; }).catch(() => {
            if (videoEl.value && (videoEl.value as any).webkitEnterFullscreen) {
                (videoEl.value as any).webkitEnterFullscreen();
                isFullscreen.value = true;
            }
        });
    } else {
        exitFS().catch(() => { });
        isFullscreen.value = false;
    }
}

function toggleAudioMenu() {
    audioMenuOpen.value = !audioMenuOpen.value;
    showControls(); // reset idle timer so menu stays visible
}

function toggleSubtitleMenu() {
    subtitleMenuOpen.value = !subtitleMenuOpen.value;
    showControls();
}

function handleKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
}

function handleClickOutside(e: MouseEvent) {
    if (audioDropdown.value && !audioDropdown.value.contains(e.target as Node))
        audioMenuOpen.value = false;
    if (subtitleDropdown.value && !subtitleDropdown.value.contains(e.target as Node))
        subtitleMenuOpen.value = false;
    const qEl = qualityDropdown.value ?? qualityDropdownNative.value;
    if (qEl && !qEl.contains(e.target as Node))
        qualityMenuOpen.value = false;
}

function goBack() { router.back(); }

// ── Jellyfin reporting ─────────────────────────────────────────────────────────

function buildReportingPayload(overrides: Record<string, any> = {}) {
    const video = videoEl.value;
    // On native path, videoEl is not available — use currentTime ref.
    // Prefer video.currentTime when it has a real position; fall back to the
    // pre-seeded currentTime ref so reportPlaybackStart sends the correct
    // resume position before the seek has taken effect (video.currentTime is
    // still 0, but currentTime.value was pre-seeded to resumeSeconds).
    const positionSec = (video?.currentTime && video.currentTime > 0)
        ? video.currentTime
        : (currentTime.value || 0);
    return {
        ItemId: itemId,
        SessionId: playSessionId.value,
        MediaSourceId: mediaSource.value?.Id || itemId,
        PositionTicks: Math.floor(positionSec * 10_000_000),
        AudioStreamIndex: selectedAudioIndex.value,
        PlayMethod: playMethod.value,
        PlaySessionId: playSessionId.value,
        ...overrides
    };
}

async function reportPlaybackStart() {
    const video = videoEl.value;
    try {
        await fetch(`${serverUrl}/Sessions/Playing`, {
            method: 'POST',
            headers: reportingHeaders,
            body: JSON.stringify(buildReportingPayload({
                IsPaused: false,
                IsMuted: video?.muted || false,
                VolumeLevel: Math.floor((video?.volume || 1) * 100),
                CanSeek: true,
            }))
        });
    } catch (e) { console.error('reportPlaybackStart error', e); }
}

async function reportPlaybackProgress() {
    const video = videoEl.value;
    try {
        await fetch(`${serverUrl}/Sessions/Playing/Progress`, {
            method: 'POST',
            headers: reportingHeaders,
            body: JSON.stringify(buildReportingPayload({
                IsPaused: !isPlaying.value,
                IsMuted: video?.muted ?? false,
                VolumeLevel: Math.floor((video?.volume ?? 1) * 100),
            }))
        });
    } catch (e) { console.error('reportPlaybackProgress error', e); }
}

async function reportPlaybackStopped() {
    try {
        await fetch(`${serverUrl}/Sessions/Playing/Stopped`, {
            method: 'POST',
            headers: reportingHeaders,
            body: JSON.stringify(buildReportingPayload()),
            keepalive: true,
        });
    } catch (e) { console.error('reportPlaybackStopped error', e); }
}

async function deleteActiveEncodings() {
    if (!playSessionId.value) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        await fetch(
            `${serverUrl}/Videos/ActiveEncodings?deviceId=${encodeURIComponent(deviceId)}&playSessionId=${encodeURIComponent(playSessionId.value)}`,
            { method: 'DELETE', headers: { 'Authorization': embyAuthHeader }, signal: controller.signal, keepalive: true }
        );
    } catch (e) { console.warn('[deleteActiveEncodings] error:', e); }
    finally { clearTimeout(timer); }
}

function startProgressReporting() {
    if (progressInterval) clearInterval(progressInterval);
    reportPlaybackStart();
    progressInterval = setInterval(reportPlaybackProgress, 10_000);
}

function stopProgressReporting() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
        reportPlaybackStopped();
    }
}

// ── Jellyfin API ───────────────────────────────────────────────────────────────

async function fetchPlaybackInfo(startTimeTicks?: number, audioStreamIndex?: number, forceTranscode = false, useNativeProfile = false, transcodeAudio = false) {
    const bitrateCap = selectedBitrate.value || 1_000_000_000;
    // When a quality cap is active we must force a real video re-encode.
    // Stripping DirectPlayProfiles prevents DirectPlay, but Jellyfin can still
    // fall back to DirectStream (remux without re-encoding), which ignores the
    // bitrate cap completely. AllowVideoStreamCopy: false tells Jellyfin it MUST
    // re-encode the video, so the bitrate/resolution cap is actually honoured.
    const shouldForce = forceTranscode || selectedBitrate.value > 0;

    const baseDeviceProfile = useNativeProfile ? nativeAndroidDeviceProfile : deviceProfile;
    const stripDirectPlay = shouldForce || transcodeAudio;
    const baseProfile = stripDirectPlay
        ? { ...baseDeviceProfile.DeviceProfile, DirectPlayProfiles: [], MaxStreamingBitrate: bitrateCap }
        : baseDeviceProfile.DeviceProfile;

    const profile: any = {
        ...baseDeviceProfile,
        MaxStreamingBitrate: bitrateCap,
        ...(shouldForce ? { AllowVideoStreamCopy: false } : {}),
        // transcodeAudio: keep video copy (DirectStream) but force Jellyfin to re-encode audio
        // (used when the device can't decode a specific audio format like E-AC3+Atmos)
        ...(transcodeAudio ? { AllowAudioStreamCopy: false } : {}),
        DeviceProfile: baseProfile,
        MediaSourceId: itemId,
        ...(startTimeTicks !== undefined ? { StartTimeTicks: startTimeTicks } : {}),
        ...(audioStreamIndex !== undefined ? { AudioStreamIndex: audioStreamIndex } : {}),
    };

    debugLog(`[AudioCrash] fetchPlaybackInfo: forceTranscode=${forceTranscode} transcodeAudio=${transcodeAudio} shouldForce=${shouldForce} stripDirectPlay=${stripDirectPlay} audioStreamIndex=${audioStreamIndex}`);
    debugLog(`[AudioCrash]   DirectPlayProfiles count=${baseProfile.DirectPlayProfiles?.length ?? 'N/A'} AllowAudioStreamCopy=${transcodeAudio ? false : 'unset'} AllowVideoStreamCopy=${shouldForce ? false : 'unset'}`);

    const response = await fetch(
        `${serverUrl}/Items/${itemId}/PlaybackInfo?userId=${store.userId}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': embyAuthHeader },
            body: JSON.stringify(profile),
        }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const ms0 = result.MediaSources?.[0];
    if (ms0) {
        debugLog(`[AudioCrash] PlaybackInfo response: SupportsDirectPlay=${ms0.SupportsDirectPlay} SupportsDirectStream=${ms0.SupportsDirectStream} TranscodingUrl=${ms0.TranscodingUrl ? 'YES' : 'NO'}`);
        const audioStreams = (ms0.MediaStreams || []).filter((s: any) => s.Type === 'Audio');
        audioStreams.forEach((s: any) => debugLog(`[AudioCrash]   Audio stream: idx=${s.Index} lang=${s.Language} codec=${s.Codec} channels=${s.Channels} displayTitle="${s.DisplayTitle}"`));
    }
    return result;
}

function parseAudioStreams(ms: any, preferredIndex?: number) {
    const streams: any[] = ms.MediaStreams || [];
    const audioStreams = streams.filter(s => s.Type === 'Audio');

    audioList.value = audioStreams.map(s => ({
        index: s.Index as number,
        language: (s.Language || 'und') as string,
        label: `${(s.Language || 'und').toUpperCase()} ${
            s.ChannelLayout ? `(${s.ChannelLayout})` :
            s.Channels ? `(${s.Channels}ch)` : ''
        } ${s.Codec ? `- ${s.Codec.toUpperCase()}` : ''}`.trim(),
    }));

    if (preferredIndex !== undefined) {
        selectedAudioIndex.value = preferredIndex;
    } else {
        const globalLang = preferencesStore.preferredAudioLanguage;
        const preferred =
            (globalLang ? audioStreams.find(s => s.Language === globalLang) : null) ||
            audioStreams.find(s => s.IsDefault) ||
            audioStreams[0];
        selectedAudioIndex.value = preferred?.Index ?? 0;
    }
}

function parseSubtitleStreams(ms: any) {
    const streams: any[] = ms.MediaStreams || [];
    const msId = ms.Id || itemId;
    subtitleList.value = streams
        .filter(s => s.Type === 'Subtitle' && (s.DeliveryUrl || (s.IsTextSubtitleStream && s.SupportsExternalStream)))
        .map(s => {
            // Jellyfin omits DeliveryUrl in DirectPlay mode. For text subtitles that
            // support external delivery, construct the extraction URL ourselves.
            const deliveryUrl = s.DeliveryUrl
                ? `${serverUrl}${s.DeliveryUrl}`
                : `${serverUrl}/Videos/${itemId}/${msId}/Subtitles/${s.Index}/0/Stream.vtt?api_key=${accessToken}`;
            return {
                index: s.Index as number,
                language: s.Language || 'und',
                label: s.DisplayTitle || `${(s.Language || 'und').toUpperCase()}${s.IsForced ? ' (Forced)' : ''}`,
                deliveryUrl,
            };
        });

    // Per-item saved choice (null = never set) → global language preference → off
    // Stored value: 'off' = explicitly off, numeric string = exact stream index
    const savedVal = localStorage.getItem(`msplayer-subtitle-${itemId}`);
    const globalSubLang = preferencesStore.preferredSubtitleLanguage;
    let preferred = null;
    if (savedVal !== null) {
        if (savedVal !== 'off') {
            const savedIdx = parseInt(savedVal, 10);
            preferred = !isNaN(savedIdx) ? subtitleList.value.find(s => s.index === savedIdx) ?? null : null;
        }
    } else if (globalSubLang) {
        preferred = subtitleList.value.find(s => s.language === globalSubLang) ?? null;
    }
    selectedSubtitleIndex.value = preferred?.index ?? null;
}

function switchSubtitle(index: number | null) {
    selectedSubtitleIndex.value = index;
    subtitleMenuOpen.value = false;
    localStorage.setItem(`msplayer-subtitle-${itemId}`, index !== null ? String(index) : 'off');
}

async function applySubtitleTracks() {
    const index = selectedSubtitleIndex.value;
    if (index === null) {
        activeTrackBlobUrl.value = null;
        return;
    }
    const sub = subtitleList.value.find(s => s.index === index);
    if (!sub) { activeTrackBlobUrl.value = null; return; }

    // Fetch and cache as a blob: URL — bypasses the browser's cross-origin <track> block
    let blobUrl = subtitleBlobCache.get(index);
    if (!blobUrl) {
        try {
            const resp = await fetch(sub.deliveryUrl);
            blobUrl = URL.createObjectURL(await resp.blob());
            subtitleBlobCache.set(index, blobUrl);
        } catch (e) {
            console.error('[subtitle] fetch failed:', e);
            return;
        }
    }

    activeTrackLang.value = sub.language;
    activeTrackLabel.value = sub.label;
    activeTrackBlobUrl.value = blobUrl;

    // Set mode = 'showing' after Vue inserts the <track> element
    await nextTick();
    const video = videoEl.value;
    if (!video) return;
    for (let i = 0; i < video.textTracks.length; i++) {
        const t = video.textTracks[i];
        if (t.label === sub.label) t.mode = 'showing';
    }
}

watch(selectedSubtitleIndex, applySubtitleTracks);

function determinePlaybackMethod(ms: any) {
    if (ms.SupportsDirectPlay) {
        playMethod.value = 'DirectPlay';
        const msId = ms.Id || itemId;
        hlsUrl.value = `${serverUrl}/Videos/${itemId}/stream?static=true&mediaSourceId=${msId}&api_key=${accessToken}`;
    } else {
        playMethod.value = ms.SupportsDirectStream ? 'DirectStream' : 'Transcode';
        if (ms.TranscodingUrl) {
            hlsUrl.value = `${serverUrl}${ms.TranscodingUrl}`.replace('?&', '?');
        } else {
            hlsUrl.value = `${serverUrl}/Videos/${itemId}/master.m3u8?mediaSourceId=${ms.Id || itemId}&api_key=${accessToken}&PlaySessionId=${playSessionId.value}`;
        }
    }
    debugLog(`[AudioCrash] determinePlaybackMethod: ${playMethod.value} url=${hlsUrl.value.substring(0, 120)}...`);
}

// ── Skip Intro ─────────────────────────────────────────────────────────────────

async function fetchIntroTimestamps() {
    try {
        const res = await fetch(
            `${serverUrl}/MediaSegments/${itemId}?includeSegmentTypes=Intro&includeSegmentTypes=Outro`,
            { headers: { Authorization: embyAuthHeader } },
        );
        if (!res.ok) return;
        const data = await res.json();
        const intro = (data.Items ?? []).find((s: any) => s.Type === 'Intro');
        if (intro) {
            // Timestamps are in ticks (100ns units)
            const start = intro.StartTicks / 10_000_000;
            const end = intro.EndTicks / 10_000_000;
            introEnd.value = end;
            skipPromptStart.value = start;
            skipPromptEnd.value = end + 10;
            if (isNative) {
                // Send timestamps to the native Activity so it can show its own Skip Intro button
                NativeVideo.setIntroTimestamps({
                    introStartMs: Math.floor(start * 1000),
                    introEndMs: Math.floor(end * 1000),
                }).catch(() => {});
            }
        }
    } catch { /* plugin not available or item has no segments */ }
}

function skipIntro() {
    if (introEnd.value === null) return;
    // Immediately hide the button
    introSkipped.value = true;
    if (isNative) {
        // Native position is stream-relative for HLS transcode — subtract resume offset
        const streamMs = Math.max(0, Math.floor(introEnd.value * 1000) - nativeResumeOffsetMs.value);
        NativeVideo.seek({ positionMs: streamMs }).catch(() => {});
    } else {
        const video = videoEl.value;
        if (!video) return;
        video.currentTime = introEnd.value;
        reportPlaybackProgress();
    }
}

// ── HLS.js init ────────────────────────────────────────────────────────────────

// Jellyfin copies StartTimeTicks from the manifest URL into every segment URL it
// generates inside the HLS playlist. The segment endpoint rejects that parameter
// with 400 Bad Request — it is only valid on the manifest endpoint. We work around
// this by supplying a custom fragment loader (fLoader) that strips StartTimeTicks
// from each segment URL before the XHR is opened. This mirrors the request filter
// the original Shaka player registered for the same reason.
function makeJellyfinFragmentLoader() {
    const DefaultLoader = (Hls as any).DefaultConfig.loader;
    return class JellyfinFragmentLoader {
        private inner: any;
        constructor(config: any) { this.inner = new DefaultLoader(config); }
        get stats() { return this.inner.stats; }
        get context() { return this.inner.context; }
        destroy() { this.inner.destroy(); }
        abort() { this.inner.abort(); }
        getResponseHeader(name: string) { return this.inner.getResponseHeader(name); }
        load(context: any, config: any, callbacks: any) {
            context.url = context.url
                .replace(/([?&])StartTimeTicks=\d+/g, (_: string, sep: string) => sep === '?' ? '?' : '')
                .replace('?&', '?')
                .replace(/[?&]$/, '');
            this.inner.load(context, config, callbacks);
        }
    };
}

function initHls(url: string, video: HTMLVideoElement, startSeconds?: number, onFatalError?: () => void) {
    if (Hls.isSupported()) {
        hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            fLoader: makeJellyfinFragmentLoader() as any,
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // Jellyfin always serves the full VOD stream starting from t=0.
            // Seek to the resume/switch position here so HLS.js loads the
            // correct segment directly instead of starting from the beginning.
            if (startSeconds && startSeconds > 0) video.currentTime = startSeconds;
            video.play().catch(() => { });
            startProgressReporting();
            applySubtitleTracks();
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
                console.error('[HLS] fatal error:', data.type, data.details);
                // Always destroy the dead instance so hls is never left as a zombie
                hls?.destroy();
                hls = null;
                if (onFatalError) {
                    onFatalError();
                } else {
                    error.value = `Playback error: ${data.type}`;
                    isLoading.value = false;
                }
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS — iOS Safari
        video.src = url;
        video.play().catch(() => { });
        startProgressReporting();
    } else {
        error.value = 'HLS playback is not supported on this device';
        isLoading.value = false;
    }
}

async function restartWithAudio(resumeSeconds: number, jellyfinAudioIndex: number | undefined, title?: string) {
    debugLog(`[AudioCrash] restartWithAudio: resumeSeconds=${resumeSeconds} jellyfinAudioIndex=${jellyfinAudioIndex} title="${title}"`);
    nativeSwitchingQuality = true;
    isLoading.value = true;
    try {
        await NativeVideo.removeAllListeners();
        await NativeVideo.stop();
        await deleteActiveEncodings();
        await initNativePlayer(resumeSeconds, jellyfinAudioIndex, title, true);
        debugLog(`[AudioCrash] restartWithAudio: initNativePlayer completed successfully`);
    } catch (e) {
        debugLog(`[AudioCrash] restartWithAudio FAILED: ${e}`);
        error.value = 'Failed to switch audio track';
        isLoading.value = false;
    } finally {
        nativeSwitchingQuality = false;
    }
}

function buildMediaTitle(item: any): string {
    if (!item) return '';
    if (item.Type === 'Episode') {
        const series = item.SeriesName || '';
        const season = item.ParentIndexNumber != null ? item.ParentIndexNumber : null;
        const episode = item.IndexNumber != null ? item.IndexNumber : null;
        const epName = item.Name || '';
        const code = season != null && episode != null
            ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
            : null;
        return [series, code, epName].filter(Boolean).join(' · ');
    }
    return item.Name || '';
}

// ── Native player init (Android ExoPlayer) ─────────────────────────────────────

async function initNativePlayer(resumeSeconds?: number, preferredAudioIndex?: number, title?: string, transcodeAudio = false) {
    isLoading.value = true;

    try {
        const startTicks = resumeSeconds && resumeSeconds > 0
            ? Math.floor(resumeSeconds * 10_000_000)
            : undefined;

        const data = await fetchPlaybackInfo(startTicks, preferredAudioIndex, false, true, transcodeAudio);
        mediaSource.value = data.MediaSources?.[0];
        if (!mediaSource.value) throw new Error('No media source available');

        if (data.PlaySessionId) playSessionId.value = data.PlaySessionId;
        parseAudioStreams(mediaSource.value, preferredAudioIndex);
        parseSubtitleStreams(mediaSource.value);
        determinePlaybackMethod(mediaSource.value);

        // Pre-seed currentTime so reportPlaybackStart sends the correct resume position.
        // Without this, PositionTicks:0 is sent and Jellyfin immediately overwrites
        // the stored position — causing startMs=0 on the very next resume attempt.
        if (resumeSeconds && resumeSeconds > 0) currentTime.value = resumeSeconds;

        await reportPlaybackStart();

        const startPositionMs = resumeSeconds && resumeSeconds > 0 ? Math.floor(resumeSeconds * 1000) : 0;

        // For HLS transcode, ExoPlayer's position is relative to the stream start
        // (position 0 = resume point T in the movie) so we add the resume offset
        // to get the absolute movie position when reporting back to Jellyfin.
        // For DirectPlay, ExoPlayer already reports the absolute file position
        // (because seekTo(startMs) was called), so no offset is needed.
        const isDirectPlayRaw = playMethod.value === 'DirectPlay' && !hlsUrl.value.includes('.m3u8');

        // Build subtitle tracks for ExoPlayer.
        // For raw DirectPlay, ExoPlayer extracts embedded text tracks from the MKV
        // container directly — passing sidecar VTTs would create duplicates.
        // For HLS (transcode / direct-stream), embedded subs are not in the HLS
        // manifest, so we pass them as external sidecar tracks.
        const subtitleTracks = isDirectPlayRaw
            ? []
            : subtitleList.value.map(s => ({
                url: s.deliveryUrl,
                lang: s.language,
                label: s.label,
            }));

        // Flag that suppresses localStorage writes in the subtitleSelected listener while
        // we are programmatically restoring a saved preference from tracksReady.
        // Without this, restore calls fire subtitleSelected which overwrites the saved value.
        let restoringSubtitle = false;

        // ExoPlayer always seeks to startPositionMs (both DirectPlay and HLS), so its
        // currentPosition is always the absolute movie position. No offset needed.
        const resumeOffsetMs = 0;
        nativeResumeOffsetMs.value = resumeOffsetMs;

        // Track the last known good position so audio error handlers can resume
        // even if the crash happens before a progress event fires.
        let lastGoodPositionSec = resumeSeconds || 0;

        // Register event listeners before starting
        await NativeVideo.addListener('progress', (data) => {
            currentTime.value = (data.positionMs + resumeOffsetMs) / 1000;
            lastGoodPositionSec = currentTime.value;
            duration.value = data.durationMs / 1000;
            if (duration.value > 0) progressPct.value = (currentTime.value / duration.value) * 100;
            reportPlaybackProgress();
        });

        await NativeVideo.addListener('stopped', async (data) => {
            currentTime.value = (data.positionMs + resumeOffsetMs) / 1000;
            if (nativeSwitchingQuality) return; // quality switch in progress — don't navigate away
            router.back();
            reportPlaybackStopped();
            deleteActiveEncodings();
        });

        await NativeVideo.addListener('ended', async () => {
            router.back();
            reportPlaybackStopped();
            deleteActiveEncodings();
        });

        await NativeVideo.addListener('error', (data) => {
            debugLog(`[AudioCrash] error listener (NO audio fallback): ${data.message}`);
            error.value = data.message;
            isLoading.value = false;
        });

        await NativeVideo.addListener('tracksReady', async (data) => {
            try {
                const parsed = JSON.parse(data.tracks);
                const nativeAudio: any[] = parsed.audioTracks ?? [];
                const nativeSubtitle: any[] = parsed.subtitleTracks ?? [];

                // For transcoded streams ExoPlayer only has 1 audio track (the
                // transcoded AAC). Keep the Jellyfin-sourced audioList so the
                // picker button stays visible and the user can switch via Jellyfin.
                const isTranscoded = playMethod.value === 'Transcode' || playMethod.value === 'DirectStream';
                if (nativeAudio.length > 0 && !isTranscoded) {
                    audioList.value = nativeAudio.map((t: any) => ({
                        index: t.groupIndex,
                        language: t.language || 'und',
                        label: `${(t.language || 'und').toUpperCase()} ${t.channelCount > 0 ? `(${t.channelCount}ch)` : ''} ${t.codec ? `- ${t.codec.toUpperCase()}` : ''}`.trim(),
                    }));

                    // Apply saved audio preference to ExoPlayer
                    const savedLang = localStorage.getItem(`msplayer-audio-${itemId}`);
                    const globalLang = preferencesStore.preferredAudioLanguage;
                    debugLog(`[AudioCrash] tracksReady: ${nativeAudio.length} audio tracks, savedLang="${savedLang}" globalLang="${globalLang}"`);
                    nativeAudio.forEach((t: any) => debugLog(`[AudioCrash]   ExoPlayer track: groupIndex=${t.groupIndex} lang="${t.language}" codec="${t.codec}" ch=${t.channelCount}`));
                    const preferredAudio =
                        (savedLang ? nativeAudio.find((t: any) => t.language === savedLang) : null) ||
                        (globalLang ? nativeAudio.find((t: any) => t.language === globalLang) : null);
                    if (preferredAudio) {
                        debugLog(`[AudioCrash] tracksReady: auto-switching to groupIndex=${preferredAudio.groupIndex} lang="${preferredAudio.language}"`);
                        NativeVideo.selectAudioTrack({ groupIndex: preferredAudio.groupIndex });
                        selectedAudioIndex.value = preferredAudio.groupIndex;
                    } else {
                        debugLog(`[AudioCrash] tracksReady: no preference match, keeping default`);
                    }
                } else if (isTranscoded) {
                    debugLog(`[AudioCrash] tracksReady: transcoded stream, keeping Jellyfin audioList (${audioList.value.length} tracks)`);
                }

                // Apply saved subtitle preference to ExoPlayer.
                // Use a native-specific key storing the track label directly to avoid
                // a fragile Jellyfin-index → label round-trip that could silently fail.
                // Set restoringSubtitle=true before every programmatic call so the
                // subtitleSelected listener does not overwrite localStorage.
                const savedNative = localStorage.getItem(`msplayer-subtitle-native-${itemId}`);
                const globalSubLang = preferencesStore.preferredSubtitleLanguage;
                NativeVideo.nativeLog({ message: `[Subtitles] savedNative=${savedNative} globalSubLang=${globalSubLang}` });
                NativeVideo.nativeLog({ message: `[Subtitles] nativeSubtitle labels=${nativeSubtitle.map((t: any) => `${t.groupIndex}:${t.label}`).join(', ')}` });
                if (savedNative === 'off') {
                    // ExoPlayer already defaults to no subtitles — no command needed.
                    // Skipping the selectSubtitleTrack(-1) call avoids firing subtitleSelected
                    // which could race with the user's own pick.
                } else if (savedNative !== null) {
                    const nativeSub = nativeSubtitle.find((t: any) => t.label === savedNative);
                    if (nativeSub) {
                        restoringSubtitle = true;
                        NativeVideo.selectSubtitleTrack({ groupIndex: nativeSub.groupIndex });
                        selectedSubtitleIndex.value = nativeSub.groupIndex;
                    }
                    // If track not found, leave ExoPlayer at its default — don't touch localStorage.
                } else if (globalSubLang) {
                    const nativeSub = nativeSubtitle.find((t: any) => t.language === globalSubLang);
                    if (nativeSub) {
                        restoringSubtitle = true;
                        NativeVideo.selectSubtitleTrack({ groupIndex: nativeSub.groupIndex });
                        selectedSubtitleIndex.value = nativeSub.groupIndex;
                    }
                    // No match for global lang — leave ExoPlayer default, don't touch localStorage.
                }
                // No preference at all — leave ExoPlayer at its default (no subtitles).
            } catch (e) {
                console.warn('[NativePlayer] Failed to parse tracksReady:', e);
            }
        });

        await NativeVideo.addListener('audioSelected', (data) => {
            localStorage.setItem(`msplayer-audio-${itemId}`, data.language);
            selectedAudioIndex.value = data.groupIndex;
        });

        await NativeVideo.addListener('subtitleSelected', (data) => {
            NativeVideo.nativeLog({ message: `[Subtitles] selected groupIndex=${data.groupIndex} label=${data.label} restoringSubtitle=${restoringSubtitle}` });
            // Ignore events that originated from our own restore calls in tracksReady.
            if (restoringSubtitle) {
                restoringSubtitle = false;
                return;
            }
            // User-initiated selection — persist it.
            if (data.groupIndex < 0) {
                localStorage.setItem(`msplayer-subtitle-native-${itemId}`, 'off');
                selectedSubtitleIndex.value = null;
            } else {
                // Store the ExoPlayer track label directly — no Jellyfin index lookup needed.
                localStorage.setItem(`msplayer-subtitle-native-${itemId}`, data.label);
                selectedSubtitleIndex.value = data.groupIndex;
            }
            NativeVideo.nativeLog({ message: `[Subtitles] saved to localStorage: ${localStorage.getItem(`msplayer-subtitle-native-${itemId}`)}` });
        });

        await NativeVideo.addListener('qualitySelected', (data) => {
            switchQualityNative(data.bitrate);
        });

        await NativeVideo.addListener('audioError', async (data) => {
            // Use lastGoodPositionSec because ExoPlayer may reset currentTime to 0
            // before this handler fires, or the crash may occur before any progress event.
            debugLog(`[AudioCrash] audioError: lastGoodPositionSec=${lastGoodPositionSec} currentTime=${currentTime.value}`);
            const savedPosition = lastGoodPositionSec;
            const audioStreams = (mediaSource.value?.MediaStreams ?? []).filter((s: any) => s.Type === 'Audio');
            debugLog(`[AudioCrash] audioError received: groupIndex=${data.groupIndex} language="${data.language}" savedPosition=${savedPosition}`);
            debugLog(`[AudioCrash]   Jellyfin audio streams: ${audioStreams.map((s: any) => `idx=${s.Index} lang="${s.Language}" codec=${s.Codec}`).join(' | ')}`);
            // ExoPlayer sends 2-letter codes ("en"), Jellyfin uses 3-letter ("eng").
            // Match by position: groupIndex is 1-based among audio tracks.
            // groupIndex=-1 means crash before tracks reported — use first/default stream.
            const jellyfinIndex = data.groupIndex >= 1
                ? (audioStreams[data.groupIndex - 1]?.Index
                    ?? audioStreams.find((s: any) => s.Language?.startsWith(data.language))?.Index
                    ?? audioStreams[0]?.Index)
                : audioStreams[0]?.Index;
            debugLog(`[AudioCrash]   matched jellyfinIndex=${jellyfinIndex}`);
            await restartWithAudio(savedPosition, jellyfinIndex, title);
        });

        await NativeVideo.addListener('audioSwitchJellyfin', async (data) => {
            // Transcoded stream: ExoPlayer only has 1 track, native picker sends Jellyfin index
            debugLog(`[AudioCrash] audioSwitchJellyfin: jellyfinIndex=${data.jellyfinIndex} lastGoodPositionSec=${lastGoodPositionSec} currentTime=${currentTime.value}`);
            await restartWithAudio(lastGoodPositionSec, data.jellyfinIndex, title);
        });

        await NativeVideo.addListener('debugLog', (data) => {
            debugLog(data.message, 'kotlin');
        });

        await NativeVideo.start({
            url: hlsUrl.value,
            authHeader: embyAuthHeader,
            startPositionMs,
            title: title || (mediaSource.value as any)?.Name || '',
            playMethod: playMethod.value,
            subtitleTracks,
            qualityPresets: JSON.stringify(availablePresets.value.map(p => ({ bitrate: p.bitrate, label: p.label }))),
            selectedBitrate: selectedBitrate.value,
            streamInfo: buildStreamInfoJson(),
            audioTracksJson: JSON.stringify(audioList.value.map(a => ({
                index: a.index,
                label: a.label,
                language: a.language,
            }))),
            selectedAudioIndex: selectedAudioIndex.value ?? -1,
        });

        isLoading.value = false;
    } catch (e: any) {
        console.error('[initNativePlayer] error:', e);
        error.value = 'Failed to initialize native player';
        isLoading.value = false;
    }
}

// ── Offline progress saving ─────────────────────────────────────────────────────

async function saveOfflineProgress() {
    if (!isOfflinePlayback || !duration.value) return;
    const percentage = (currentTime.value / duration.value) * 100;
    const completed = percentage >= 90;
    await offlineDatabase.saveWatchProgress({
        itemId,
        position: currentTime.value,
        duration: duration.value,
        percentage,
        completed,
        lastWatched: Date.now(),
        synced: false,
    });
}

// ── Offline player init (local downloaded file) ────────────────────────────────

async function initOfflinePlayer(cachedDownload: any, resumeSeconds?: number, itemTitle?: string) {
    isOfflinePlayback = true;
    isLoading.value = true;
    try {
        // Native (ExoPlayer): raw file:// URI — ExoPlayer can't access
        // Capacitor's https://localhost/_capacitor_file_/ WebView URLs.
        // Web: read from IndexedDB (Capacitor's web Filesystem backend)
        // and create a blob URL for the <video> element.
        let playUrl: string | null = null;
        if (isNative) {
            const fileInfo = await Filesystem.getUri({
                path: cachedDownload.filePath,
                directory: Directory.Data,
            });
            playUrl = fileInfo.uri; // file:///data/user/0/...
        } else {
            const fileData = await Filesystem.readFile({
                path: cachedDownload.filePath,
                directory: Directory.Data,
            });
            const resp = await fetch(`data:video/mp4;base64,${fileData.data}`);
            const blob = await resp.blob();
            playUrl = URL.createObjectURL(blob);
        }

        if (!playUrl) {
            error.value = 'Downloaded file not found on device';
            isLoading.value = false;
            return;
        }

        hlsUrl.value = playUrl;
        playMethod.value = 'DirectPlay';
        const startPositionMs = resumeSeconds && resumeSeconds > 0 ? Math.floor(resumeSeconds * 1000) : 0;

        // Offline mode: NO network calls — no reportPlaybackStart/Progress/Stopped,
        // no startProgressReporting, no deleteActiveEncodings.
        if (isNative) {
            let nativeProgressCount = 0;
            await NativeVideo.addListener('progress', (data) => {
                currentTime.value = data.positionMs / 1000;
                duration.value = data.durationMs / 1000;
                if (duration.value > 0) progressPct.value = (currentTime.value / duration.value) * 100;
                if (++nativeProgressCount % 10 === 0) saveOfflineProgress();
            });
            await NativeVideo.addListener('stopped', async () => {
                await saveOfflineProgress();
                router.back();
            });
            await NativeVideo.addListener('ended', async () => {
                await saveOfflineProgress();
                router.back();
            });
            await NativeVideo.addListener('error', (data) => {
                error.value = data.message;
                isLoading.value = false;
            });

            await NativeVideo.start({
                url: playUrl,
                authHeader: '',
                startPositionMs,
                title: itemTitle || '',
                playMethod: 'DirectPlay',
                subtitleTracks: [],
            });
        } else {
            const video = videoEl.value;
            if (!video) return;
            video.src = playUrl;
            if (resumeSeconds && resumeSeconds > 0) {
                const seekOnce = () => {
                    video.removeEventListener('loadedmetadata', seekOnce);
                    video.currentTime = resumeSeconds;
                    video.play().catch(() => {});
                };
                video.addEventListener('loadedmetadata', seekOnce);
            } else {
                video.play().catch(() => {});
            }
            offlineProgressInterval = setInterval(saveOfflineProgress, 10_000);
        }

        isLoading.value = false;
    } catch (e: any) {
        console.error('[initOfflinePlayer] error:', e);
        error.value = 'Failed to play downloaded file';
        isLoading.value = false;
    }
}

// ── Player init ────────────────────────────────────────────────────────────────

async function initPlayer(resumeSeconds?: number, preferredAudioIndex?: number) {
    const video = videoEl.value;
    if (!video) return;
    isLoading.value = true;

    try {
        const startTicks = resumeSeconds && resumeSeconds > 0
            ? Math.floor(resumeSeconds * 10_000_000)
            : undefined;

        // Force transcode when resuming so Jellyfin always returns an HLS stream.
        // DirectPlay serves the raw file and relies on video.currentTime seeking, which
        // is unreliable for MKV/HEVC content. HLS + StartTimeTicks is the reliable path.
        const data = await fetchPlaybackInfo(startTicks, preferredAudioIndex, !!(startTicks && startTicks > 0));
        mediaSource.value = data.MediaSources?.[0];
        if (!mediaSource.value) throw new Error('No media source available');

        if (data.PlaySessionId) playSessionId.value = data.PlaySessionId;
        parseAudioStreams(mediaSource.value, preferredAudioIndex);
        parseSubtitleStreams(mediaSource.value);
        determinePlaybackMethod(mediaSource.value);

        if (playMethod.value === 'DirectPlay') {
            video.src = hlsUrl.value;
            if (resumeSeconds && resumeSeconds > 0) {
                // Seek after metadata loads to avoid a brief flash from position 0
                const seekOnce = () => {
                    video.removeEventListener('loadedmetadata', seekOnce);
                    video.currentTime = resumeSeconds;
                    video.play().catch(() => { });
                    startProgressReporting();
                };
                video.addEventListener('loadedmetadata', seekOnce);
            } else {
                video.play().catch(() => { });
                startProgressReporting();
            }
        } else {
            // Jellyfin serves a full VOD HLS stream starting from t=0 regardless of
            // StartTimeTicks. Pre-seed the timer and seek via video.currentTime in
            // MANIFEST_PARSED so HLS.js jumps directly to the right segment.
            if (resumeSeconds && resumeSeconds > 0) currentTime.value = resumeSeconds;
            initHls(hlsUrl.value, video, resumeSeconds);
        }

        // Auto-fullscreen on mobile on initial load
        const isMobileDevice = navigator.maxTouchPoints > 0 && window.innerWidth < 1024;
        if (isMobileDevice) {
            const container = video.parentElement;
            if (container) requestFS(container).then(() => { isFullscreen.value = true; }).catch(() => { });
        }
    } catch (e: any) {
        console.error('[initPlayer] error:', e);
        error.value = 'Failed to initialize player';
        isLoading.value = false;
    }
}

// ── Audio track switching ──────────────────────────────────────────────────────

// Restart playback after a failed audio switch. Fetches a fresh session for
// previousIndex from movieTime and re-initialises the player. Called from both
// the synchronous catch path and the async HLS.js fatal-error callback.
async function rollbackAudio(previousIndex: number | null, movieTime: number) {
    console.warn('[rollbackAudio] reverting to index', previousIndex, 'at', movieTime);

    // Ensure any partially-initialised HLS instance is gone before we start fresh
    if (hls) { hls.destroy(); hls = null; }
    const video = videoEl.value;
    if (video) { video.removeAttribute('src'); video.load(); }

    error.value = 'Audio switch failed — reverting to previous track';
    selectedAudioIndex.value = previousIndex;

    if (!video) { isLoading.value = false; return; }

    try {
        const startTicks = movieTime > 0 ? Math.floor(movieTime * 10_000_000) : undefined;
        const data = await fetchPlaybackInfo(startTicks, previousIndex ?? undefined);

        mediaSource.value = data.MediaSources?.[0];
        if (!mediaSource.value) throw new Error('No media source for rollback');

        if (data.PlaySessionId) playSessionId.value = data.PlaySessionId;
        determinePlaybackMethod(mediaSource.value);

        if (playMethod.value === 'DirectPlay') {
            video.src = hlsUrl.value;
            if (movieTime > 0) {
                const seekOnce = () => {
                    video.removeEventListener('loadedmetadata', seekOnce);
                    video.currentTime = movieTime;
                    video.play().catch(() => { });
                    startProgressReporting();
                };
                video.addEventListener('loadedmetadata', seekOnce);
            } else {
                video.play().catch(() => { });
                startProgressReporting();
            }
        } else {
            initHls(hlsUrl.value, video, movieTime); // if rollback itself fails, show a plain error
        }

        // Clear the revert notice once the player has recovered
        setTimeout(() => { if (error.value?.startsWith('Audio switch failed')) error.value = null; }, 3000);
    } catch (e) {
        console.error('[rollbackAudio] failed:', e);
        error.value = 'Playback error — please go back and try again';
        isLoading.value = false;
    }
}

async function switchAudio(index: number) {
    if (index === selectedAudioIndex.value || isSwitching) return;
    isSwitching = true;
    audioMenuOpen.value = false;

    const video = videoEl.value;
    if (!video) { isSwitching = false; return; }

    isLoading.value = true;
    const movieTime = video.currentTime;
    const previousIndex = selectedAudioIndex.value; // saved for rollback on either failure path

    // Teardown: pause → stop reporting → destroy HLS → clear src
    video.pause();
    stopProgressReporting();
    if (hls) { hls.destroy(); hls = null; }
    video.removeAttribute('src');
    video.load();

    // Kill the old FFmpeg session before asking Jellyfin to start a new one
    await deleteActiveEncodings();

    try {
        const startTicks = Math.floor(movieTime * 10_000_000);
        // forceTranscode=true strips DirectPlay profiles — ensures Jellyfin always
        // returns a TranscodingUrl so we can select the specific audio stream.
        const data = await fetchPlaybackInfo(startTicks, index, true);

        mediaSource.value = data.MediaSources?.[0];
        if (!mediaSource.value) throw new Error('No media source');

        if (data.PlaySessionId) playSessionId.value = data.PlaySessionId;
        selectedAudioIndex.value = index;
        const chosenLang = audioList.value.find(a => a.index === index)?.language;
        if (chosenLang) localStorage.setItem(`msplayer-audio-${itemId}`, chosenLang);

        // For audio switching we must always use HLS — DirectPlay serves the raw
        // file and cannot select a specific audio stream. We build the URL ourselves
        // rather than calling determinePlaybackMethod(), which might resolve to
        // DirectPlay if Jellyfin still marks SupportsDirectPlay even after we
        // stripped DirectPlayProfiles via forceTranscode=true.
        const ms = mediaSource.value;
        if (ms.TranscodingUrl) {
            // Ensure AudioStreamIndex is correct in the URL — Jellyfin doesn't always
            // embed it from the request body.
            let url = ms.TranscodingUrl.replace('?&', '?');
            url = /AudioStreamIndex=\d+/.test(url)
                ? url.replace(/AudioStreamIndex=\d+/, `AudioStreamIndex=${index}`)
                : url + `&AudioStreamIndex=${index}`;
            hlsUrl.value = `${serverUrl}${url}`;
            playMethod.value = ms.SupportsDirectStream ? 'DirectStream' : 'Transcode';
        } else {
            // Jellyfin didn't return a TranscodingUrl — build one manually.
            hlsUrl.value = `${serverUrl}/Videos/${itemId}/master.m3u8?mediaSourceId=${ms.Id || itemId}&api_key=${accessToken}&AudioStreamIndex=${index}&PlaySessionId=${playSessionId.value}`;
            playMethod.value = 'Transcode';
        }

        // Pass rollback as the fatal-error callback so an async HLS.js failure also
        // triggers recovery — not just synchronous errors caught below.
        initHls(hlsUrl.value, video, movieTime, () => rollbackAudio(previousIndex, movieTime));
    } catch (e: any) {
        console.error('[switchAudio] error:', e);
        await rollbackAudio(previousIndex, movieTime);
    } finally {
        isSwitching = false;
    }
}

// ── Stream info ────────────────────────────────────────────────────────────────

async function fetchTranscodingInfo() {
    try {
        const res = await fetch(
            `${serverUrl}/Sessions?activeWithinSeconds=10`,
            { headers: { 'Authorization': embyAuthHeader } }
        );
        if (!res.ok) return;
        const sessions: any[] = await res.json();
        // Match by our stable deviceId first, then fall back to playSessionId
        const session = sessions.find(s => s.DeviceId === deviceId)
            ?? sessions.find(s => s.PlayState?.PlaySessionId === playSessionId.value);
        liveTranscodingInfo.value = session?.TranscodingInfo ?? null;
    } catch { liveTranscodingInfo.value = null; }
}

function buildStreamInfoJson(): string {
    const vs = videoStream.value;
    const as_ = activeAudioStream.value;
    const ti = liveTranscodingInfo.value;
    const info: Record<string, any> = { playMethod: playMethod.value };
    if (ti?.TranscodeReasons?.length) info.transcodeReason = ti.TranscodeReasons[0];
    if (ti?.Width != null) info.resolution = `${ti.Width}×${ti.Height}`;
    else if (vs?.Width) info.resolution = `${vs.Width}×${vs.Height}`;
    info.videoCodec = ti?.VideoCodec ?? vs?.Codec ?? '';
    info.isVideoDirect = ti ? !!ti.IsVideoDirect : true;
    if (ti?.Bitrate) info.videoBitrate = ti.Bitrate;
    else if (vs?.BitRate) info.videoBitrate = vs.BitRate;
    if (ti && !ti.IsVideoDirect) info.framerate = ti.Framerate ?? 0;
    else info.framerate = vs?.RealFrameRate ?? vs?.AverageFrameRate ?? 0;
    info.audioCodec = ti?.AudioCodec ?? as_?.Codec ?? '';
    info.isAudioDirect = ti ? !!ti.IsAudioDirect : true;
    info.audioChannels = as_?.ChannelLayout ?? (as_?.Channels ? `${as_.Channels}ch` : '');
    if (as_?.BitRate) info.audioBitrate = as_.BitRate;
    return JSON.stringify(info);
}

function openInfoModal() {
    infoModalOpen.value = true;
    showControls();
    fetchTranscodingInfo();
    infoPollingInterval = setInterval(fetchTranscodingInfo, 2000);
}

function closeInfoModal() {
    infoModalOpen.value = false;
    if (infoPollingInterval) { clearInterval(infoPollingInterval); infoPollingInterval = null; }
    liveTranscodingInfo.value = null;
}

// ── Quality ────────────────────────────────────────────────────────────────────

function toggleQualityMenu() {
    qualityMenuOpen.value = !qualityMenuOpen.value;
    showControls();
}

async function switchQuality(bitrate: number) {
    if (bitrate === selectedBitrate.value || isSwitching) return;
    isSwitching = true;
    qualityMenuOpen.value = false;

    const video = videoEl.value;
    if (!video) { isSwitching = false; return; }

    isLoading.value = true;
    const movieTime = video.currentTime;
    const previousBitrate = selectedBitrate.value;

    video.pause();
    stopProgressReporting();
    if (hls) { hls.destroy(); hls = null; }
    video.removeAttribute('src');
    video.load();
    await deleteActiveEncodings();

    try {
        selectedBitrate.value = bitrate;
        preferencesStore.preferredBitrate = bitrate;
        const startTicks = Math.floor(movieTime * 10_000_000);
        // bitrate > 0 forces transcode (DirectPlay can't honour a bitrate cap)
        const data = await fetchPlaybackInfo(startTicks, selectedAudioIndex.value ?? undefined, bitrate > 0);
        mediaSource.value = data.MediaSources?.[0];
        if (!mediaSource.value) throw new Error('No media source');
        if (data.PlaySessionId) playSessionId.value = data.PlaySessionId;

        parseAudioStreams(mediaSource.value, selectedAudioIndex.value ?? undefined);
        parseSubtitleStreams(mediaSource.value);

        const ms = mediaSource.value;
        if (ms.TranscodingUrl) {
            hlsUrl.value = `${serverUrl}${ms.TranscodingUrl.replace('?&', '?')}`;
            // If we requested AllowVideoStreamCopy:false (bitrate > 0), it's a real transcode.
            // Otherwise fall back to what Jellyfin reports.
            playMethod.value = bitrate > 0 ? 'Transcode' : (ms.SupportsDirectStream ? 'DirectStream' : 'Transcode');
            initHls(hlsUrl.value, video, movieTime);
        } else {
            determinePlaybackMethod(ms);
            if (playMethod.value === 'DirectPlay') {
                video.src = hlsUrl.value;
                video.currentTime = movieTime;
                video.play().catch(() => { });
                startProgressReporting();
            } else {
                initHls(hlsUrl.value, video, movieTime);
            }
        }
    } catch (e: any) {
        console.error('[switchQuality] error:', e);
        selectedBitrate.value = previousBitrate;
        error.value = 'Failed to switch quality';
        isLoading.value = false;
    } finally {
        isSwitching = false;
    }
}

async function switchQualityNative(bitrate: number) {
    if (bitrate === selectedBitrate.value || isSwitching) return;
    isSwitching = true;
    qualityMenuOpen.value = false;
    isLoading.value = true;

    const previousBitrate = selectedBitrate.value;

    try {
        nativeSwitchingQuality = true;

        // Register a stopped listener *before* calling stop so we capture the exact
        // ExoPlayer position at the moment the Activity finishes — more accurate than
        // the last 5-second progress tick stored in currentTime.value.
        let resolveStopPos!: (v: number) => void;
        const stopPosPromise = new Promise<number>(r => { resolveStopPos = r; });
        await NativeVideo.addListener('stopped', (data) => {
            resolveStopPos((data.positionMs + nativeResumeOffsetMs.value) / 1000);
        });

        await NativeVideo.stop();

        // Wait up to 2 s for the stopped event; fall back to last known position.
        const resumeSeconds = await Promise.race([
            stopPosPromise,
            new Promise<number>(r => setTimeout(() => r(currentTime.value), 2000)),
        ]);

        await NativeVideo.removeAllListeners();
        await deleteActiveEncodings();

        selectedBitrate.value = bitrate;
        preferencesStore.preferredBitrate = bitrate;

        // Re-init native player with the new bitrate
        await initNativePlayer(resumeSeconds, selectedAudioIndex.value ?? undefined);

        // Push updated stream info & presets to native after the switch
        await fetchTranscodingInfo();
        await NativeVideo.updateStreamInfo({ streamInfo: buildStreamInfoJson() });
        await NativeVideo.updateQualityPresets({
            presets: JSON.stringify(availablePresets.value.map(p => ({ bitrate: p.bitrate, label: p.label }))),
            selectedBitrate: selectedBitrate.value,
        });
    } catch (e: any) {
        console.error('[switchQualityNative] error:', e);
        selectedBitrate.value = previousBitrate;
        error.value = 'Failed to switch quality';
        isLoading.value = false;
    } finally {
        nativeSwitchingQuality = false;
        isSwitching = false;
    }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(async () => {
    if (audioPlayerStore.isPlaying) audioPlayerStore.stop();
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

        await initOfflinePlayer(cachedDownload, resumeSeconds, buildMediaTitle(cachedDownload.jellyfinItem));
        if (!isNative) {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('fullscreenchange', () => { isFullscreen.value = !!getFullscreenElement(); });
            document.addEventListener('webkitfullscreenchange', () => { isFullscreen.value = !!getFullscreenElement(); });
            document.addEventListener('keydown', handleKeyDown);
        }
        return;
    }

    // Always fetch fresh details — cached currentItem may have stale PlaybackPositionTicks
    let details: any = null;
    try {
        details = await store.fetchItemDetails(itemId);
    } catch (e) {
        console.warn('[Player] Failed to load item details:', e);
    }

    // Prefer ticks passed through the route query (set by the calling page which has live data).
    // Fall back to Jellyfin's stored value only if no route ticks are present.
    const routeStartTicks = route.query.startTicks ? Number(route.query.startTicks) : null;
    const resumeTicks = routeStartTicks ?? details?.UserData?.PlaybackPositionTicks;
    const resumeSeconds = resumeTicks ? resumeTicks / 10_000_000 : undefined;

    // Determine preferred audio: saved user choice → global preferred lang → marked default → first track.
    const allStreams: any[] = details?.MediaStreams || [];
    const audioStreams = allStreams.filter(s => s.Type === 'Audio');
    const savedLang = localStorage.getItem(`msplayer-audio-${itemId}`);
    const globalLang = preferencesStore.preferredAudioLanguage;
    const preferred =
        (savedLang ? audioStreams.find((s: any) => s.Language === savedLang) : null) ||
        (globalLang ? audioStreams.find((s: any) => s.Language === globalLang) : null) ||
        audioStreams.find((s: any) => s.IsDefault) ||
        audioStreams[0];
    const preferredAudioIndex: number | undefined = preferred?.Index;

    if (isNative) {
        await initNativePlayer(resumeSeconds, preferredAudioIndex, buildMediaTitle(details));
    } else {
        await initPlayer(resumeSeconds, preferredAudioIndex);
        document.addEventListener('click', handleClickOutside);
        document.addEventListener('fullscreenchange', () => { isFullscreen.value = !!getFullscreenElement(); });
        document.addEventListener('webkitfullscreenchange', () => { isFullscreen.value = !!getFullscreenElement(); });
        document.addEventListener('keydown', handleKeyDown);
    }

    fetchIntroTimestamps();
});

onBeforeUnmount(() => {
    unlockOrientation();

    if (isNative) {
        // Save progress BEFORE removing listeners or stopping
        if (isOfflinePlayback) {
            saveOfflineProgress();
        } else {
            reportPlaybackStopped();
            deleteActiveEncodings();
        }
        NativeVideo.removeAllListeners();
        NativeVideo.stop().catch(() => {});
        return;
    }

    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleKeyDown);

    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (infoPollingInterval) { clearInterval(infoPollingInterval); infoPollingInterval = null; }
    if (offlineProgressInterval) { clearInterval(offlineProgressInterval); offlineProgressInterval = null; }
    if (isOfflinePlayback) {
        saveOfflineProgress();
    } else {
        stopProgressReporting();
        deleteActiveEncodings();
    }

    hls?.destroy();
    hls = null;

    subtitleBlobCache.forEach(url => URL.revokeObjectURL(url));
    subtitleBlobCache.clear();

    // Revoke blob URL if offline playback created one
    if (isOfflinePlayback && hlsUrl.value.startsWith('blob:')) {
        URL.revokeObjectURL(hlsUrl.value);
    }

    const video = videoEl.value;
    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }
});
</script>

<style scoped>
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
</style>

<style scoped>
.skip-intro-enter-active,
.skip-intro-leave-active {
    transition: opacity 300ms ease, transform 300ms ease;
}
.skip-intro-enter-from,
.skip-intro-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
</style>

<style>
video::cue {
    background-color: transparent;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.7);
}
</style>
