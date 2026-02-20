<template>
    <div class="fixed inset-0 bg-black text-gray-300 flex flex-col z-[100] h-dvh"
        style="padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)">

        <!-- Error -->
        <section v-if="error"
            class="absolute top-[70px] left-1/2 -translate-x-1/2 z-[200] text-error bg-black/90 px-6 py-3 rounded-lg">
            {{ error }}
        </section>

        <div class="relative w-full flex-1 overflow-hidden bg-black" @mousemove="showControls"
            @mouseleave="hideControls" @touchstart="showControls">

            <!-- Loader -->
            <div v-if="isLoading" class="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
                <Loader2 class="size-15 animate-spin text-accent-purple" />
                <p class="mt-5 text-white text-base font-medium">Loading...</p>
            </div>

            <!-- Video -->
            <video ref="videoEl" class="w-full h-full bg-black object-contain" preload="metadata" playsinline
                :poster="posterUrl" @click="handleVideoTap" @timeupdate="onTimeUpdate"
                @loadedmetadata="onLoadedMetadata" @loadstart="onLoadStart" @canplay="onCanPlay" @waiting="onWaiting"
                @playing="onPlaying"></video>

            <!-- Controls -->
            <div class="absolute inset-0 flex flex-col justify-end player-gradient px-4 pt-5 transition-opacity duration-300"
                :class="controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
                style="padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px))">

                <!-- Back button -->
                <button
                    class="absolute left-3 bg-black/50 text-white border-none cursor-pointer px-3.5 py-2 rounded-lg flex items-center gap-1.5 text-[0.95rem] font-medium transition-colors hover:bg-white/15 z-10"
                    style="top: env(safe-area-inset-top, 12px)" @click="goBack">
                    <ArrowLeft class="size-5" />
                    Back
                </button>

                <!-- Progress bar -->
                <div class="w-full h-6 flex items-center cursor-pointer mb-3 group" @click="seek">
                    <div
                        class="w-full h-1 bg-white/30 rounded-sm relative transition-[height] duration-200 group-hover:h-1.5">
                        <div class="h-full bg-accent-purple rounded-sm transition-[width] duration-100 ease-linear"
                            :style="{ width: progress + '%' }"></div>
                    </div>
                </div>

                <!-- Bottom controls -->
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <!-- Play/Pause -->
                        <button
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center gap-1.5 transition-colors hover:bg-white/10"
                            @click="togglePlayPause">
                            <Play v-if="!isPlaying" class="size-6 fill-current" />
                            <Pause v-else class="size-6 fill-current" />
                        </button>

                        <!-- Volume -->
                        <div class="flex items-center gap-2">
                            <button
                                class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                                @click="toggleMute">
                                <Volume2 v-if="volume > 50" class="size-6" />
                                <Volume1 v-else-if="volume > 0" class="size-6" />
                                <VolumeX v-else class="size-6" />
                            </button>
                            <Slider :model-value="[volume]" :max="100" :step="1" class="w-20"
                                @update:model-value="(v?: number[]) => { if (v) { volume = v[0]; setVolume(); } }" />
                        </div>

                        <!-- Time -->
                        <div class="text-[0.9rem] text-white tabular-nums min-w-[110px]">
                            {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <!-- Audio tracks -->
                        <div v-if="audioList.length" class="relative" ref="audioDropdown">
                            <button
                                class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center gap-1.5 transition-colors hover:bg-white/10"
                                @click="toggleAudioMenu">
                                <AudioLines class="size-6" />
                                <span class="text-[0.9rem] font-medium">Audio</span>
                            </button>
                            <div class="absolute bottom-full right-0 mb-2 bg-[rgba(28,28,28,0.98)] rounded-lg min-w-[250px] max-h-[400px] overflow-y-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-all duration-200 scrollbar-hide"
                                :class="audioMenuOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-2.5'">
                                <div v-for="opt in audioList" :key="opt.id"
                                    class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10"
                                    :class="opt.index === selectedAudioIndex && 'bg-accent-purple/20'"
                                    @click="selectAudio(opt.index)">
                                    <Check class="size-4 shrink-0"
                                        :class="opt.index === selectedAudioIndex ? 'opacity-100' : 'opacity-0'" />
                                    {{ opt.label }}
                                </div>
                            </div>
                        </div>

                        <!-- Subtitles -->
                        <div v-if="subtitleList.length" class="relative" ref="subtitleDropdown">
                            <button
                                class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center gap-1.5 transition-colors hover:bg-white/10"
                                @click="toggleSubtitleMenu">
                                <Subtitles class="size-6" />
                                <span class="text-[0.9rem] font-medium">Subtitles</span>
                            </button>
                            <div class="absolute bottom-full right-0 mb-2 bg-[rgba(28,28,28,0.98)] rounded-lg min-w-[250px] max-h-[400px] overflow-y-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-all duration-200 scrollbar-hide"
                                :class="subtitleMenuOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-2.5'">
                                <div class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10"
                                    :class="selectedSubtitleIndex === '-1' && 'bg-accent-purple/20'"
                                    @click="selectSubtitle('-1')">
                                    <Check class="size-4 shrink-0"
                                        :class="selectedSubtitleIndex === '-1' ? 'opacity-100' : 'opacity-0'" />
                                    Disabled
                                </div>
                                <div v-for="opt in subtitleList" :key="opt.id"
                                    class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10"
                                    :class="opt.index === parseInt(selectedSubtitleIndex) && 'bg-accent-purple/20'"
                                    @click="selectSubtitle(String(opt.index))">
                                    <Check class="size-4 shrink-0"
                                        :class="opt.index === parseInt(selectedSubtitleIndex) ? 'opacity-100' : 'opacity-0'" />
                                    {{ opt.label }}
                                </div>
                                <div class="h-px bg-white/10 my-1"></div>
                                <div class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10"
                                    @click="selectSubtitle('local')">
                                    <span class="size-4 shrink-0"></span>
                                    Load local file...
                                </div>
                            </div>
                        </div>

                        <!-- Quality -->
                        <div class="relative" ref="qualityDropdown">
                            <button
                                class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex flex-wrap items-center justify-center gap-1.5 transition-colors hover:bg-white/10"
                                @click="toggleQualityMenu">
                                <Settings class="size-6" />
                                <span class="text-[0.9rem] font-medium">{{ qualityLabel }}</span>
                                <Badge
                                    class="text-[0.65rem] font-semibold uppercase tracking-wide bg-accent-purple/30 text-sky-300 border-none px-1.5 py-0.5 rounded">
                                    {{ playMethodLabel }}</Badge>
                            </button>
                            <div class="absolute bottom-full right-0 mb-2 bg-[rgba(28,28,28,0.98)] rounded-lg min-w-[250px] max-h-[400px] overflow-y-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-all duration-200 scrollbar-hide"
                                :class="qualityMenuOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-2.5'">
                                <div v-for="preset in qualityPresets" :key="preset.key"
                                    class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10"
                                    :class="preset.key === selectedQuality && 'bg-accent-purple/20'"
                                    @click="selectQuality(preset.key)">
                                    <Check class="size-4 shrink-0"
                                        :class="preset.key === selectedQuality ? 'opacity-100' : 'opacity-0'" />
                                    {{ preset.label }}
                                </div>
                            </div>
                        </div>

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

            <input ref="fileInput" type="file" accept=".vtt,.srt" class="hidden" @change="onPickSubtitleFile" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useOfflineStore } from '@/store/offline-store';
import { downloadService } from '@/services/downloadService';
import { offlineDatabase } from '@/services/offlineDatabase';
import shaka from 'shaka-player/dist/shaka-player.compiled.js';
import { deviceProfile } from '@/constants';
import { formatTime } from '@/utils/helpers';
import { lockLandscape, unlockOrientation } from '@/utils/orientation';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, Play, Pause, Volume2, Volume1, VolumeX, AudioLines, Subtitles, Settings, Maximize, Minimize, Loader2, Check } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const audioPlayerStore = useAudioPlayerStore();
const offlineStore = useOfflineStore();

const itemId = route.params.id as string;
const accessToken = store.accessToken || '';
const serverUrl = store.serverUrl;

const videoEl = ref<HTMLVideoElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const audioDropdown = ref<HTMLElement | null>(null);
const subtitleDropdown = ref<HTMLElement | null>(null);
const qualityDropdown = ref<HTMLElement | null>(null);
const error = ref<string | null>(null);

let player: shaka.Player | null = null;
let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
let mediaListenersAttached = false;

const details = ref<any | null>(null);
const mediaSource = ref<any | null>(null);
const isOfflinePlayback = ref(false);
let offlineProgressInterval: ReturnType<typeof setInterval> | null = null;

const audioList = ref<Array<{ id: number; index: number; label: string; language: string }>>([]);
const selectedAudioIndex = ref<number | null>(null);

const subtitleList = ref<
    Array<{ id: number; index: number; label: string; language: string; codec: string; isExternal: boolean }>
>([]);
const selectedSubtitleIndex = ref<string>('-1');

// State
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const progress = ref(0);
const volume = ref(100);
const isFullscreen = ref(false);
const controlsVisible = ref(true);
const audioMenuOpen = ref(false);
const subtitleMenuOpen = ref(false);
const isLoading = ref(true);

// Playback method & quality
const playMethod = ref<'DirectPlay' | 'DirectStream' | 'Transcode'>('Transcode');
const selectedQuality = ref<string>('auto');
const qualityMenuOpen = ref(false);

const qualityPresets = [
    { key: 'auto', label: 'Auto (Original)', bitrate: 1000000000 },
    { key: '1080p', label: '1080p', bitrate: 20000000 },
    { key: '720p', label: '720p', bitrate: 8000000 },
    { key: '480p', label: '480p', bitrate: 4000000 },
];

const playMethodLabel = computed(() => {
    if (playMethod.value === 'DirectPlay') return 'Direct Play';
    if (playMethod.value === 'DirectStream') return 'Direct Stream';
    const preset = qualityPresets.find(p => p.key === selectedQuality.value);
    return preset && preset.key !== 'auto' ? `Transcode ${preset.label}` : 'Transcode';
});

const qualityLabel = computed(() => {
    return qualityPresets.find(p => p.key === selectedQuality.value)?.label || 'Auto';
});

function getMediaElement(): HTMLMediaElement | null {
    return videoEl.value;
}

// Reporting Jellyfin
const playSessionId = ref<string>('');
let progressInterval: ReturnType<typeof setInterval> | null = null;

const posterUrl = computed(
    () => store.getImageUrl(itemId, 'Primary') || ''
);

const hlsUrl = ref<string>('');
const baseTranscodingUrl = ref<string>('');

function onLoadStart() {
    isLoading.value = true;
}
function onCanPlay() {
    isLoading.value = false;
}
function onWaiting() {
    isLoading.value = true;
}
function onPlaying() {
    isLoading.value = false;
}

function showControls() {
    controlsVisible.value = true;
    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        if (isPlaying.value && !audioMenuOpen.value && !subtitleMenuOpen.value && !qualityMenuOpen.value) {
            controlsVisible.value = false;
        }
    }, 3000);
}
function hideControls() {
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (isPlaying.value && !audioMenuOpen.value && !subtitleMenuOpen.value && !qualityMenuOpen.value) {
        controlsTimeout = setTimeout(() => {
            controlsVisible.value = false;
        }, 1000);
    }
}

function goBack() {
    router.back();
}

// Session ID
function generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Reporting Jellyfin
const reportingHeaders = {
    'Content-Type': 'application/json',
    'X-Emby-Token': accessToken
};

function buildReportingPayload(overrides: Record<string, any> = {}) {
    const media = getMediaElement();
    return {
        ItemId: itemId,
        SessionId: playSessionId.value,
        MediaSourceId: mediaSource.value?.Id || itemId,
        PositionTicks: Math.floor((media?.currentTime || 0) * 10_000_000),
        PlayMethod: playMethod.value,
        PlaySessionId: playSessionId.value,
        ...overrides
    };
}

function buildFullReportingPayload(overrides: Record<string, any> = {}) {
    const media = getMediaElement();
    return buildReportingPayload({
        IsMuted: media?.muted || false,
        VolumeLevel: Math.floor((media?.volume || 1) * 100),
        AudioStreamIndex: selectedAudioIndex.value,
        SubtitleStreamIndex:
            selectedSubtitleIndex.value !== '-1'
                ? parseInt(selectedSubtitleIndex.value)
                : null,
        ...overrides
    });
}

async function reportPlaybackStart() {
    if (!playSessionId.value) {
        playSessionId.value = generateSessionId();
    }
    try {
        await fetch(`${serverUrl}/Sessions/Playing`, {
            method: 'POST',
            headers: reportingHeaders,
            body: JSON.stringify(buildFullReportingPayload({ IsPaused: false }))
        });
    } catch (e) {
        console.error('reportPlaybackStart error', e);
    }
}

async function reportPlaybackProgress() {
    const media = getMediaElement();
    if (!media) return;
    try {
        await fetch(`${serverUrl}/Sessions/Playing/Progress`, {
            method: 'POST',
            headers: reportingHeaders,
            body: JSON.stringify(buildFullReportingPayload({ IsPaused: !isPlaying.value }))
        });
    } catch (e) {
        console.error('reportPlaybackProgress error', e);
    }
}

async function reportPlaybackStopped() {
    const media = getMediaElement();
    if (!media) return;
    try {
        await fetch(`${serverUrl}/Sessions/Playing/Stopped`, {
            method: 'POST',
            headers: reportingHeaders,
            body: JSON.stringify(buildReportingPayload())
        });
    } catch (e) {
        console.error('reportPlaybackStopped error', e);
    }
}

function startProgressReporting() {
    if (progressInterval) clearInterval(progressInterval);
    reportPlaybackStart();
    progressInterval = setInterval(() => {
        reportPlaybackProgress();
    }, 10000);
}

function stopProgressReporting() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    if (getMediaElement()) {
        reportPlaybackStopped();
    }
}

// Interactions
function handleVideoTap() {
    if (controlsVisible.value) {
        controlsVisible.value = false;
        if (controlsTimeout) clearTimeout(controlsTimeout);
    } else {
        showControls();
    }
}

function togglePlayPause() {
    const media = getMediaElement();
    if (!media) return;
    if (media.paused) {
        media.play().then(() => {
            isPlaying.value = true;
            reportPlaybackProgress();
        });
    } else {
        media.pause();
        isPlaying.value = false;
        reportPlaybackProgress();
    }
}

function toggleMute() {
    const media = getMediaElement();
    if (!media) return;
    media.muted = !media.muted;
    volume.value = media.muted ? 0 : media.volume * 100;
}

function setVolume() {
    const media = getMediaElement();
    if (!media) return;
    media.volume = volume.value / 100;
    media.muted = volume.value === 0;
}

function seek(e: MouseEvent) {
    const progressBar = e.currentTarget as HTMLElement;
    const clickX = e.offsetX;
    const width = progressBar.offsetWidth;
    const media = getMediaElement();
    if (!media) return;
    media.currentTime = (clickX / width) * duration.value;
    reportPlaybackProgress();
}

function isMobile(): boolean {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
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

function getFullscreenElement(): Element | null {
    return document.fullscreenElement || (document as any).webkitFullscreenElement || null;
}

function toggleFullscreen() {
    const container = videoEl.value?.parentElement;
    if (!container) return;

    if (!getFullscreenElement()) {
        requestFS(container).then(() => {
            isFullscreen.value = true;
        }).catch(() => {
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
    subtitleMenuOpen.value = false;
    qualityMenuOpen.value = false;
    showControls();
}
function toggleSubtitleMenu() {
    subtitleMenuOpen.value = !subtitleMenuOpen.value;
    audioMenuOpen.value = false;
    qualityMenuOpen.value = false;
    showControls();
}
function toggleQualityMenu() {
    qualityMenuOpen.value = !qualityMenuOpen.value;
    audioMenuOpen.value = false;
    subtitleMenuOpen.value = false;
    showControls();
}

function selectAudio(index: number) {
    selectedAudioIndex.value = index;
    audioMenuOpen.value = false;
    switchAudio();
}
function selectSubtitle(index: string) {
    selectedSubtitleIndex.value = index;
    subtitleMenuOpen.value = false;
    switchSubtitle();
}
function selectQuality(key: string) {
    if (key === selectedQuality.value) return;
    qualityMenuOpen.value = false;
    switchQuality(key);
}

function onTimeUpdate() {
    const media = getMediaElement();
    if (!media) return;
    currentTime.value = media.currentTime;
    if (duration.value > 0) {
        progress.value = (media.currentTime / duration.value) * 100;
    }
}
function onLoadedMetadata() {
    const media = getMediaElement()!;
    duration.value = media.duration;
    volume.value = media.volume * 100;
}

// Load item details
async function loadDetails() {
    try {
        details.value =
            store.currentItem?.Id === itemId
                ? store.currentItem
                : await store.fetchItemDetails(itemId);
    } catch (e: any) {
        error.value = 'Failed to load media details';
    }
}

// Determine playback method from media source
function determinePlaybackMethod(ms: any) {
    if (ms.SupportsDirectPlay && selectedQuality.value === 'auto') {
        playMethod.value = 'DirectPlay';
        const msId = ms.Id || itemId;
        hlsUrl.value = `${serverUrl}/Videos/${itemId}/stream?static=true&mediaSourceId=${msId}&api_key=${accessToken}`;
    } else if (ms.SupportsDirectStream && selectedQuality.value === 'auto') {
        playMethod.value = 'DirectStream';
        if (ms.TranscodingUrl) baseTranscodingUrl.value = ms.TranscodingUrl;
        buildHlsUrl();
    } else {
        playMethod.value = 'Transcode';
        if (ms.TranscodingUrl) baseTranscodingUrl.value = ms.TranscodingUrl;
        buildHlsUrl();
    }
}

async function getPlaybackUrl() {
    try {
        const maxBitrate = selectedQuality.value !== 'auto'
            ? qualityPresets.find(p => p.key === selectedQuality.value)?.bitrate
            : undefined;
        const data = await fetchPlaybackInfo(undefined, maxBitrate);
        mediaSource.value = data.MediaSources?.[0];
        if (!mediaSource.value) throw new Error('No media source available');

        const streams = mediaSource.value.MediaStreams || [];
        const audioStreams = streams.filter((s: any) => s.Type === 'Audio');
        audioList.value = audioStreams.map((s: any) => ({
            id: s.Index,
            index: s.Index,
            language: s.Language || 'und',
            label: `${(s.Language || 'und').toUpperCase()} ${s.ChannelLayout ? `(${s.ChannelLayout})` : s.Channels ? `(${s.Channels}ch)` : ''
                } ${s.Codec ? `- ${s.Codec.toUpperCase()}` : ''}`.trim()
        }));

        const subtitleStreams = streams.filter((s: any) => s.Type === 'Subtitle');
        subtitleList.value = subtitleStreams.map((s: any) => ({
            id: s.Index,
            index: s.Index,
            language: s.Language || 'und',
            codec: s.Codec,
            isExternal: s.IsExternal || false,
            label: `${(s.Language || 'und').toUpperCase()} ${s.Title ? `- ${s.Title}` : ''
                } ${s.IsForced ? '(Forced)' : ''}`.trim()
        }));

        const frenchStream = audioStreams.find(
            (s: any) => s.Language === 'fra' || s.Language === 'fre' || s.Language === 'fr'
        );
        const defaultStream =
            frenchStream || audioStreams.find((s: any) => s.IsDefault) || audioStreams[0];
        selectedAudioIndex.value = defaultStream?.Index ?? 0;

        // Use server's PlaySessionId for proper session tracking
        if (data.PlaySessionId) {
            playSessionId.value = data.PlaySessionId;
        }

        // Reset base transcoding URL
        baseTranscodingUrl.value = '';

        // Determine playback method
        determinePlaybackMethod(mediaSource.value);
    } catch (e: any) {
        console.error('PlaybackInfo error:', e);
        error.value = 'Failed to get playback URL';
    }
}

function buildHlsUrl() {
    if (baseTranscodingUrl.value) {
        let transcodingPath = baseTranscodingUrl.value;
        transcodingPath = transcodingPath.replace('?&', '?');
        transcodingPath = transcodingPath.replace(
            /AudioStreamIndex=\d+/,
            `AudioStreamIndex=${selectedAudioIndex.value}`
        );
        hlsUrl.value = `${serverUrl}${transcodingPath}`;
    } else {
        hlsUrl.value = `${serverUrl}/Videos/${itemId}/master.m3u8?mediaSourceId=${mediaSource.value?.Id || itemId
            }&AudioStreamIndex=${selectedAudioIndex.value}&api_key=${accessToken}`;
    }
}

function attachMediaListeners(media: HTMLMediaElement) {
    if (mediaListenersAttached) return;
    mediaListenersAttached = true;

    media.addEventListener('play', () => {
        isPlaying.value = true;
        if (!progressInterval) startProgressReporting();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });
    media.addEventListener('pause', () => {
        isPlaying.value = false;
        reportPlaybackProgress();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    });
    media.addEventListener('ended', () => {
        stopProgressReporting();
        clearMediaSession();
    });
    media.addEventListener('timeupdate', () => {
        updateMediaSessionPosition();
    });
}

async function addSubtitleTrack(shakaPlayer: shaka.Player, blobUrl: string, lang: string, label: string) {
    shakaPlayer.setTextTrackVisibility(false);

    await shakaPlayer.addTextTrackAsync(
        blobUrl,
        lang,
        'subtitles',
        'text/vtt',
        undefined,
        label
    );

    shakaPlayer.setTextTrackVisibility(true);

    const tracks = shakaPlayer.getTextTracks();
    if (tracks.length > 0) {
        shakaPlayer.selectTextTrack(tracks[tracks.length - 1]);
    }
}

function addNativeSubtitleTrack(video: HTMLVideoElement, blobUrl: string, lang: string, label: string) {
    const existing = video.querySelectorAll('track.dynamic-sub');
    existing.forEach(t => t.remove());

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = label;
    track.srclang = lang;
    track.src = blobUrl;
    track.default = true;
    track.classList.add('dynamic-sub');
    video.appendChild(track);

    for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = i === video.textTracks.length - 1 ? 'showing' : 'hidden';
    }
}

async function fetchPlaybackInfo(audioStreamIndex?: number, maxBitrate?: number, startTimeTicks?: number) {
    const profile: any = {
        ...deviceProfile,
        MediaSourceId: itemId,
        ...(audioStreamIndex !== undefined ? { AudioStreamIndex: audioStreamIndex } : {}),
        ...(startTimeTicks !== undefined ? { StartTimeTicks: startTimeTicks } : {}),
    };

    if (maxBitrate) {
        profile.MaxStreamingBitrate = maxBitrate;
        profile.DeviceProfile = {
            ...deviceProfile.DeviceProfile,
            MaxStreamingBitrate: maxBitrate,
            MaxStaticBitrate: maxBitrate,
        };
    }

    const response = await fetch(
        `${serverUrl}/Items/${itemId}/PlaybackInfo?userId=${store.userId}&api_key=${accessToken}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile)
        }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
}

// Player init (handles both DirectPlay and Shaka/HLS)
async function initPlayer(seekTo?: number, resumePlaying?: boolean) {
    const video = videoEl.value!;
    isLoading.value = true;

    console.log('[initPlayer] Start:', { playMethod: playMethod.value, hlsUrl: hlsUrl.value, seekTo, resumePlaying });

    try {
        if (playMethod.value === 'DirectPlay') {
            video.src = hlsUrl.value;

            if (seekTo !== undefined) {
                await new Promise<void>((resolve, reject) => {
                    let settled = false;
                    const cleanup = () => {
                        video.removeEventListener('loadedmetadata', onLoaded);
                        video.removeEventListener('error', onError);
                        clearTimeout(timer);
                    };
                    const onLoaded = () => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        video.currentTime = seekTo;
                        resolve();
                    };
                    const onError = () => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        reject(new Error('Video failed to load'));
                    };
                    const timer = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        // Resolve anyway — let playback attempt continue
                        resolve();
                    }, 15000);
                    video.addEventListener('loadedmetadata', onLoaded);
                    video.addEventListener('error', onError);
                });
            }

            attachMediaListeners(video);
            setupMediaSession();

            if (resumePlaying !== false) {
                await video.play().catch(() => { });
            }
        } else {
            shaka.polyfill.installAll();

            player = new shaka.Player(video);
            player.configure({
                preferredAudioLanguage: 'fra',
                preferredTextLanguage: 'fra',
                abr: {
                    enabled: true,
                    defaultBandwidthEstimate: 5_000_000
                },
                streaming: {
                    bufferingGoal: 20,
                    rebufferingGoal: 2,
                    bufferBehind: 20,
                    retryParameters: {
                        maxAttempts: 5,
                        baseDelay: 1000
                    }
                }
            });

            player.addEventListener('error', (ev: any) => {
                const e = ev.detail;
                console.error('Shaka error:', e);
                error.value = `Shaka error ${e.code}: ${e.data?.[2] || 'Playback error'}`;
                isLoading.value = false;
            });

            // Strip StartTimeTicks from segment requests — the manifest
            // endpoint uses it to offset transcoding, but the segment
            // endpoint rejects it with 400.
            const engine = player.getNetworkingEngine();
            if (engine) {
                engine.registerRequestFilter((_type: number, request: any) => {
                    if (_type === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
                        request.uris = request.uris.map((uri: string) =>
                            uri.replace(/([&?])StartTimeTicks=\d+/g, '$1').replace(/[&?]$/, '')
                        );
                    }
                });
            }

            console.log('[initPlayer] Shaka loading:', hlsUrl.value);
            await player.load(hlsUrl.value);
            console.log('[initPlayer] Shaka loaded successfully');

            if (seekTo !== undefined) {
                console.log('[initPlayer] Seeking to:', seekTo);
                video.currentTime = seekTo;
            }

            attachMediaListeners(video);
            setupMediaSession();

            if (resumePlaying !== false) {
                console.log('[initPlayer] Calling video.play()');
                // Don't await play() — in the Shaka/MSE path it can stay
                // pending indefinitely while buffering. Loading state is
                // managed by @waiting/@playing/@canplay on the video element.
                video.play().catch((err) => {
                    console.warn('[initPlayer] play() rejected:', err);
                });
                console.log('[initPlayer] play() fired (not awaited)');
            }
        }

        // Auto-fullscreen on mobile (only on initial load, not on reload)
        if (seekTo === undefined && isMobile()) {
            const container = videoEl.value?.parentElement;
            if (container) {
                requestFS(container).then(() => {
                    isFullscreen.value = true;
                }).catch(() => { });
            }
        }
    } catch (e: any) {
        console.error('Player init error:', e);
        error.value = 'Player initialization error';
        isLoading.value = false;
    }
}

// Teardown current player (Shaka or native)
async function teardownPlayer() {
    const video = videoEl.value;
    if (player) {
        await player.unload().catch(() => { });
        await player.destroy().catch(() => { });
        player = null;
    }
    if (video) {
        video.removeAttribute('src');
        video.load();
    }
    mediaListenersAttached = false;
}

// Audio track switching
async function switchAudio() {
    if (selectedAudioIndex.value === null) return;

    isLoading.value = true;
    const video = videoEl.value!;
    const wasPlaying = !video.paused;
    const savedTime = video.currentTime;

    console.log('[switchAudio] Start:', {
        audioIndex: selectedAudioIndex.value,
        savedTime,
        wasPlaying,
        currentPlayMethod: playMethod.value,
    });

    try {
        video.pause();
        stopProgressReporting();
        await teardownPlayer();

        await new Promise(resolve => setTimeout(resolve, 200));

        const maxBitrate = selectedQuality.value !== 'auto'
            ? qualityPresets.find(p => p.key === selectedQuality.value)?.bitrate
            : undefined;

        // Tell the server to start transcoding from the current position
        const startTicks = Math.floor(savedTime * 10_000_000);

        try {
            const data = await fetchPlaybackInfo(selectedAudioIndex.value!, maxBitrate, startTicks);
            const ms = data.MediaSources?.[0];
            console.log('[switchAudio] PlaybackInfo response:', {
                hasMediaSource: !!ms,
                supportsDirectPlay: ms?.SupportsDirectPlay,
                supportsTranscoding: ms?.SupportsTranscoding,
                transcodingUrl: ms?.TranscodingUrl?.substring(0, 120),
                playSessionId: data.PlaySessionId,
            });
            if (ms) {
                mediaSource.value = ms;
                if (data.PlaySessionId) {
                    playSessionId.value = data.PlaySessionId;
                }

                // For audio switching, we need the server to provide the specific
                // audio track. Skip DirectPlay (serves raw file, no track selection)
                // and build a transcoding/streaming URL with the audio index.
                if (ms.TranscodingUrl) {
                    baseTranscodingUrl.value = ms.TranscodingUrl;
                    playMethod.value = ms.SupportsDirectStream ? 'DirectStream' : 'Transcode';
                    buildHlsUrl();
                } else {
                    // No transcoding URL — build a fallback HLS URL
                    baseTranscodingUrl.value = '';
                    playMethod.value = 'Transcode';
                    buildHlsUrl();
                }
            }
        } catch (fetchErr) {
            console.error('[switchAudio] fetchPlaybackInfo failed:', fetchErr);
            buildHlsUrl();
        }

        // Append StartTimeTicks to the URL so the server starts transcoding
        // from the current position instead of from the beginning.
        if (startTicks > 0 && hlsUrl.value) {
            const sep = hlsUrl.value.includes('?') ? '&' : '?';
            hlsUrl.value += `${sep}StartTimeTicks=${startTicks}`;
        }

        console.log('[switchAudio] Loading player with:', {
            playMethod: playMethod.value,
            hlsUrl: hlsUrl.value,
        });

        await initPlayer(undefined, wasPlaying);
        isLoading.value = false;
        switchSubtitle();

        console.log('[switchAudio] Complete');
    } catch (e: any) {
        console.error('[switchAudio] Error:', e);
        error.value = 'Error switching audio track';
        isLoading.value = false;
    }
}

// Quality switching
async function switchQuality(key: string) {
    selectedQuality.value = key;

    const video = videoEl.value!;
    const wasPlaying = !video.paused;
    const savedTime = video.currentTime;

    isLoading.value = true;
    video.pause();
    stopProgressReporting();

    await teardownPlayer();

    const maxBitrate = key !== 'auto'
        ? qualityPresets.find(p => p.key === key)?.bitrate
        : undefined;

    const startTicks = Math.floor(savedTime * 10_000_000);

    try {
        const data = await fetchPlaybackInfo(selectedAudioIndex.value ?? undefined, maxBitrate, startTicks);
        const ms = data.MediaSources?.[0];
        if (ms) {
            mediaSource.value = ms;
            baseTranscodingUrl.value = '';
            if (data.PlaySessionId) {
                playSessionId.value = data.PlaySessionId;
            }
            determinePlaybackMethod(ms);
        }
    } catch (e: any) {
        console.error('Quality switch error:', e);
        error.value = 'Error switching quality';
        isLoading.value = false;
        return;
    }

    if (hlsUrl.value) {
        if (startTicks > 0) {
            const sep = hlsUrl.value.includes('?') ? '&' : '?';
            hlsUrl.value += `${sep}StartTimeTicks=${startTicks}`;
        }
        await initPlayer(undefined, wasPlaying);
    }

    switchSubtitle();
}

// Clean VTT: remove Region: lines
function cleanVttRegions(vtt: string): string {
    return vtt
        .split('\n')
        .filter(line => !line.trim().startsWith('Region:'))
        .join('\n');
}

// Remote subtitles via Jellyfin
async function switchSubtitle() {
    const selected = selectedSubtitleIndex.value;

    if (selected === 'local') {
        fileInput.value?.click();
        return;
    }

    if (selected === '-1') {
        if (player) {
            player.setTextTrackVisibility(false);
        } else {
            const video = videoEl.value;
            if (video) {
                for (let i = 0; i < video.textTracks.length; i++) {
                    video.textTracks[i].mode = 'hidden';
                }
            }
        }
        return;
    }

    const subIndex = parseInt(selected);
    const subtitle = subtitleList.value.find(s => s.index === subIndex);
    if (!subtitle) return;

    try {
        const mediaSourceId = mediaSource.value?.Id || itemId;
        const vttUrl = `${serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${subIndex}/Stream.vtt?api_key=${accessToken}`;

        const resp = await fetch(vttUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const raw = await resp.text();
        const cleaned = cleanVttRegions(raw);

        const blob = new Blob([cleaned], { type: 'text/vtt; charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);

        if (player) {
            await addSubtitleTrack(player, blobUrl, subtitle.language || 'und', subtitle.label);
        } else {
            const video = videoEl.value;
            if (video) {
                addNativeSubtitleTrack(video, blobUrl, subtitle.language || 'und', subtitle.label);
            }
        }
    } catch (e: any) {
        console.error('Error loading subtitles:', e);
        error.value = `Failed to load subtitles: ${e.message}`;
    }
}

// SRT to VTT conversion
function srtToVtt(srt: string) {
    let vtt = srt
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();

    vtt = vtt.replace(/^\d+\s*$/gm, '');
    vtt = vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    vtt = vtt.replace(/\n{3,}/g, '\n\n');

    vtt = `WEBVTT\n\n${vtt}`;
    return cleanVttRegions(vtt);
}

// Local subtitle file
async function onPickSubtitleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
        selectedSubtitleIndex.value = '-1';
        return;
    }

    const name = file.name;
    const lower = name.toLowerCase();
    const isVtt = lower.endsWith('.vtt');
    const isSrt = lower.endsWith('.srt');

    try {
        const text = await file.text();

        let vttContent: string;
        if (isVtt) {
            vttContent = text.trim().startsWith('WEBVTT') ? text : `WEBVTT\n\n${text}`;
        } else if (isSrt) {
            vttContent = srtToVtt(text);
        } else {
            error.value = 'Unsupported subtitle format';
            selectedSubtitleIndex.value = '-1';
            return;
        }

        vttContent = cleanVttRegions(vttContent);

        const blob = new Blob([vttContent], { type: 'text/vtt; charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);

        const m = name.match(/\.(fr|fra|fre|eng|en|spa|es|de|it|pt|jp|ja|zh|ru)\./i);
        const lang = m ? m[1].toLowerCase() : 'und';

        if (player) {
            await addSubtitleTrack(player, blobUrl, lang, name);
        } else {
            const video = videoEl.value;
            if (video) {
                addNativeSubtitleTrack(video, blobUrl, lang, name);
            }
        }
    } catch (err: any) {
        error.value = `Failed to load local subtitle: ${err.message}`;
        selectedSubtitleIndex.value = '-1';
    } finally {
        if (fileInput.value) fileInput.value.value = '';
    }
}

// Media Session API (lock screen / notification controls)
function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    const artUrl = store.getImageUrl(itemId, 'Primary', 512, 512);
    navigator.mediaSession.metadata = new MediaMetadata({
        title: details.value?.Name || 'Video',
        artist: details.value?.SeriesName || details.value?.AlbumArtist || '',
        album: details.value?.Album || details.value?.SeasonName || '',
        artwork: artUrl ? [{ src: artUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
    });

    const video = videoEl.value;
    navigator.mediaSession.setActionHandler('play', () => {
        video?.play();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
        video?.pause();
    });
    navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (video && d.seekTime != null) video.currentTime = d.seekTime;
    });
    navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        if (video) video.currentTime = Math.max(0, video.currentTime - (d.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler('seekforward', (d) => {
        if (video) video.currentTime = Math.min(video.duration || 0, video.currentTime + (d.seekOffset || 10));
    });
}

function updateMediaSessionPosition() {
    if (!('mediaSession' in navigator)) return;
    const video = videoEl.value;
    if (!video || !video.duration || isNaN(video.duration)) return;
    try {
        navigator.mediaSession.setPositionState({
            duration: video.duration,
            playbackRate: video.playbackRate,
            position: Math.min(video.currentTime, video.duration),
        });
    } catch { /* ignore */ }
}

function clearMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
}

// Offline playback support
async function playOffline() {
    try {
        const localFileUrl = await downloadService.getLocalFile(itemId);
        if (!localFileUrl) {
            throw new Error('Local file not found');
        }

        console.log('[Player] Offline playback:', localFileUrl);

        const video = videoEl.value;
        if (!video) throw new Error('Video element not found');

        video.src = localFileUrl;

        // Wait for metadata to load
        await new Promise<void>((resolve, reject) => {
            const onLoaded = () => {
                video.removeEventListener('loadedmetadata', onLoaded);
                video.removeEventListener('error', onError);
                resolve();
            };
            const onError = (_: Event) => {
                video.removeEventListener('loadedmetadata', onLoaded);
                video.removeEventListener('error', onError);
                reject(new Error('Failed to load video'));
            };
            video.addEventListener('loadedmetadata', onLoaded);
            video.addEventListener('error', onError);
        });

        attachMediaListeners(video);

        // Restore saved progress
        const savedProgress = await offlineDatabase.getWatchProgress(itemId);
        if (savedProgress && savedProgress.position > 0) {
            video.currentTime = savedProgress.position;
        }

        startOfflineProgressTracking();

        setupMediaSession();

        // Start playback
        await video.play().catch((err) => {
            console.warn('[Player] Auto-play blocked, user interaction needed:', err);
        });

        isOfflinePlayback.value = true;
        isLoading.value = false;
        console.log('[Player] Offline playback started');
    } catch (e: any) {
        console.error('[Player] Offline playback error:', e);
        error.value = 'Unable to play offline file';
        isLoading.value = false;
    }
}

function startOfflineProgressTracking() {
    if (offlineProgressInterval) return;

    offlineProgressInterval = setInterval(async () => {
        const video = videoEl.value;
        if (!video || !video.duration || isNaN(video.duration)) return;

        const progress = {
            itemId,
            position: video.currentTime,
            duration: video.duration,
            percentage: (video.currentTime / video.duration) * 100,
            completed: (video.currentTime / video.duration) > 0.9,
            lastWatched: Date.now(),
            synced: false,
        };

        await offlineDatabase.saveWatchProgress(progress);
    }, 10000);
}

function stopOfflineProgressTracking() {
    if (offlineProgressInterval) {
        clearInterval(offlineProgressInterval);
        offlineProgressInterval = null;
    }
}

// Lifecycle
onMounted(async () => {
    // Stop any background audio playback before starting video
    if (audioPlayerStore.isPlaying) {
        audioPlayerStore.stop();
    }

    await loadDetails();
    await lockLandscape();

    // Check if item is downloaded and play offline if available
    const isDownloaded = offlineStore.isItemDownloaded(itemId);

    if (isDownloaded) {
        console.log('[Player] Item downloaded, playing offline');
        await playOffline();
    } else if (offlineStore.isFullyOnline) {
        console.log('[Player] Online playback');
        await getPlaybackUrl();
        if (hlsUrl.value) {
            const resumeTicks = details.value?.UserData?.PlaybackPositionTicks;
            const resumeSeconds = resumeTicks ? resumeTicks / 10_000_000 : undefined;
            await initPlayer(resumeSeconds);
        }
    } else {
        error.value = 'File not available offline. Connect to the internet to watch this content.';
        return;
    }

    document.addEventListener('click', e => {
        if (audioDropdown.value && !audioDropdown.value.contains(e.target as Node)) {
            audioMenuOpen.value = false;
        }
        if (subtitleDropdown.value && !subtitleDropdown.value.contains(e.target as Node)) {
            subtitleMenuOpen.value = false;
        }
        if (qualityDropdown.value && !qualityDropdown.value.contains(e.target as Node)) {
            qualityMenuOpen.value = false;
        }
    });

    document.addEventListener('fullscreenchange', () => {
        isFullscreen.value = !!getFullscreenElement();
    });
    document.addEventListener('webkitfullscreenchange', () => {
        isFullscreen.value = !!getFullscreenElement();
    });

    window.addEventListener('beforeunload', () => {
        stopProgressReporting();
    });
});

onBeforeUnmount(() => {
    unlockOrientation();
    clearMediaSession();

    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    stopOfflineProgressTracking();

    if (getMediaElement() && !isOfflinePlayback.value) {
        reportPlaybackStopped();
    }

    if (player) {
        player.destroy().catch(() => { });
        player = null;
    }

    if (controlsTimeout) {
        clearTimeout(controlsTimeout);
        controlsTimeout = null;
    }
});
</script>
