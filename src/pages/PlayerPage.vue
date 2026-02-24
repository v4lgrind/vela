<template>
    <div class="fixed inset-0 bg-black text-white flex flex-col z-[100] h-dvh"
        style="padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)">

        <!-- Error -->
        <section v-if="error"
            class="absolute top-[70px] left-1/2 -translate-x-1/2 z-[200] text-red-400 bg-black/90 px-6 py-3 rounded-lg text-sm">
            {{ error }}
        </section>

        <div class="relative w-full flex-1 overflow-hidden bg-black" @mousemove="showControls"
            @mouseleave="hideControls" @touchstart="showControls">

            <!-- Back button — always visible above loader so user can escape a stuck load -->
            <button
                class="absolute left-3 bg-black/50 text-white border-none cursor-pointer px-3.5 py-2 rounded-lg flex items-center gap-1.5 text-[0.95rem] font-medium transition-colors hover:bg-white/15 z-[60]"
                style="top: env(safe-area-inset-top, 12px)" @click="goBack">
                <ArrowLeft class="size-5" />
                Back
            </button>

            <!-- Loading overlay -->
            <div v-if="isLoading" class="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
                <Loader2 class="size-15 animate-spin text-accent-purple" />
                <p class="mt-5 text-white text-base font-medium">Loading...</p>
            </div>

            <!-- Video element -->
            <video ref="videoEl" class="w-full h-full bg-black object-contain" preload="metadata" playsinline
                :poster="posterUrl" @click="handleVideoTap" @loadstart="onLoadStart" @canplay="onCanPlay"
                @waiting="onWaiting" @playing="onPlaying" @pause="onPause" @timeupdate="onTimeUpdate"
                @loadedmetadata="onLoadedMetadata" @ended="onEnded" />

            <!-- Controls overlay (auto-hide) -->
            <div class="absolute inset-0 flex flex-col justify-end player-gradient px-4 pt-5 transition-opacity duration-300"
                :class="controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
                style="padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px))"
                @click.self="handleVideoTap">

                <!-- Progress bar -->
                <div class="w-full h-6 flex items-center cursor-pointer mb-3 group" @click="seek">
                    <div
                        class="w-full h-1 bg-white/30 rounded-sm relative transition-[height] duration-200 group-hover:h-1.5">
                        <div class="h-full bg-accent-purple rounded-sm transition-[width] duration-100 ease-linear"
                            :style="{ width: progressPct + '%' }"></div>
                    </div>
                </div>

                <!-- Bottom controls -->
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <!-- Play/Pause -->
                        <button
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                            @click="togglePlayPause">
                            <Play v-if="!isPlaying" class="size-6 fill-current" />
                            <Pause v-else class="size-6 fill-current" />
                        </button>

                        <!-- Mute -->
                        <button
                            class="bg-transparent border-none text-white cursor-pointer p-2 rounded flex items-center transition-colors hover:bg-white/10"
                            @click="toggleMute">
                            <VolumeX v-if="isMuted" class="size-6" />
                            <Volume2 v-else class="size-6" />
                        </button>

                        <!-- Time -->
                        <div class="text-[0.9rem] text-white tabular-nums min-w-[110px]">
                            {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
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
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import Hls from 'hls.js';
import { deviceProfile } from '@/constants';
import { formatTime } from '@/utils/helpers';
import { lockLandscape, unlockOrientation } from '@/utils/orientation';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Minimize, Loader2 } from 'lucide-vue-next';

// ── Setup ──────────────────────────────────────────────────────────────────────

const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const audioPlayerStore = useAudioPlayerStore();

const itemId = route.params.id as string;
const accessToken = store.accessToken || '';
const serverUrl = store.serverUrl;

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

const posterUrl = computed(() => store.getImageUrl(itemId, 'Primary') || '');

let hls: Hls | null = null;
let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
let progressInterval: ReturnType<typeof setInterval> | null = null;

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
    if (duration.value > 0) progressPct.value = (video.currentTime / duration.value) * 100;
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
        if (isPlaying.value) controlsVisible.value = false;
    }, 3000);
}

function hideControls() {
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (isPlaying.value) {
        controlsTimeout = setTimeout(() => { controlsVisible.value = false; }, 1000);
    }
}

function handleVideoTap() {
    const isTouchDevice = navigator.maxTouchPoints > 0 && window.innerWidth < 1024;
    if (isTouchDevice) {
        if (controlsVisible.value) {
            controlsVisible.value = false;
            if (controlsTimeout) clearTimeout(controlsTimeout);
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
        video.play().then(() => { reportPlaybackProgress(); });
    } else {
        video.pause();
        reportPlaybackProgress();
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
    video.currentTime = ratio * duration.value;
    reportPlaybackProgress();
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
            // Fallback: iOS Safari video element fullscreen
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

function handleKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
}

function goBack() { router.back(); }

// ── Jellyfin reporting ─────────────────────────────────────────────────────────

function buildReportingPayload(overrides: Record<string, any> = {}) {
    const video = videoEl.value;
    return {
        ItemId: itemId,
        SessionId: playSessionId.value,
        MediaSourceId: mediaSource.value?.Id || itemId,
        PositionTicks: Math.floor((video?.currentTime || 0) * 10_000_000),
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
            }))
        });
    } catch (e) { console.error('reportPlaybackStart error', e); }
}

async function reportPlaybackProgress() {
    const video = videoEl.value;
    if (!video) return;
    try {
        await fetch(`${serverUrl}/Sessions/Playing/Progress`, {
            method: 'POST',
            headers: reportingHeaders,
            body: JSON.stringify(buildReportingPayload({
                IsPaused: !isPlaying.value,
                IsMuted: video.muted,
                VolumeLevel: Math.floor(video.volume * 100),
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

async function fetchPlaybackInfo(startTimeTicks?: number) {
    const profile: any = {
        ...deviceProfile,
        MediaSourceId: itemId,
        ...(startTimeTicks !== undefined ? { StartTimeTicks: startTimeTicks } : {}),
    };
    const response = await fetch(
        `${serverUrl}/Items/${itemId}/PlaybackInfo?userId=${store.userId}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': embyAuthHeader },
            body: JSON.stringify(profile),
        }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
}

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
}

// ── HLS.js init ────────────────────────────────────────────────────────────────

function initHls(url: string, video: HTMLVideoElement) {
    if (Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => { });
            startProgressReporting();
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
                error.value = `Playback error: ${data.type}`;
                isLoading.value = false;
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

// ── Player init ────────────────────────────────────────────────────────────────

async function initPlayer(resumeSeconds?: number) {
    const video = videoEl.value;
    if (!video) return;
    isLoading.value = true;

    try {
        const startTicks = resumeSeconds && resumeSeconds > 0
            ? Math.floor(resumeSeconds * 10_000_000)
            : undefined;

        const data = await fetchPlaybackInfo(startTicks);
        mediaSource.value = data.MediaSources?.[0];
        if (!mediaSource.value) throw new Error('No media source available');

        if (data.PlaySessionId) playSessionId.value = data.PlaySessionId;
        determinePlaybackMethod(mediaSource.value);

        if (playMethod.value === 'DirectPlay') {
            video.src = hlsUrl.value;
            if (resumeSeconds && resumeSeconds > 0) {
                // Seek after metadata loads to avoid brief flash from position 0
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
            // HLS.js handles Transcode and DirectStream
            initHls(hlsUrl.value, video);
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

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(async () => {
    // Stop any background audio before starting video
    if (audioPlayerStore.isPlaying) audioPlayerStore.stop();
    lockLandscape();

    // Load item details to get resume position (PlaybackPositionTicks)
    let details: any = null;
    try {
        details = store.currentItem?.Id === itemId
            ? store.currentItem
            : await store.fetchItemDetails(itemId);
    } catch (e) {
        console.warn('[Player] Failed to load item details:', e);
    }

    const resumeTicks = details?.UserData?.PlaybackPositionTicks;
    const resumeSeconds = resumeTicks ? resumeTicks / 10_000_000 : undefined;

    await initPlayer(resumeSeconds);

    document.addEventListener('fullscreenchange', () => { isFullscreen.value = !!getFullscreenElement(); });
    document.addEventListener('webkitfullscreenchange', () => { isFullscreen.value = !!getFullscreenElement(); });
    document.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
    unlockOrientation();
    document.removeEventListener('keydown', handleKeyDown);

    if (controlsTimeout) clearTimeout(controlsTimeout);
    stopProgressReporting();
    deleteActiveEncodings();

    hls?.destroy();
    hls = null;

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
</style>
