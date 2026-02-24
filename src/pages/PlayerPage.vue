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
                @loadedmetadata="onLoadedMetadata" @ended="onEnded">
                <track
                    v-if="activeTrackBlobUrl"
                    :key="selectedSubtitleIndex ?? -1"
                    kind="subtitles"
                    :srclang="activeTrackLang"
                    :label="activeTrackLabel"
                    :src="activeTrackBlobUrl"
                />
            </video>

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
                                <span class="text-[0.9rem] font-medium">Audio</span>
                            </button>
                            <div class="absolute bottom-full right-0 mb-2 bg-[rgba(28,28,28,0.98)] rounded-lg min-w-[250px] max-h-[400px] overflow-y-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-all duration-200 scrollbar-hide"
                                :class="audioMenuOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-2.5'">
                                <div v-for="opt in audioList" :key="opt.index"
                                    class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10"
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
                                <span class="text-[0.9rem] font-medium">Subs</span>
                            </button>
                            <div class="absolute bottom-full right-0 mb-2 bg-[rgba(28,28,28,0.98)] rounded-lg min-w-[250px] max-h-[400px] overflow-y-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-all duration-200 scrollbar-hide"
                                :class="subtitleMenuOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-2.5'">
                                <!-- Off -->
                                <div
                                    class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10"
                                    :class="selectedSubtitleIndex === null ? 'bg-accent-purple/20' : ''"
                                    @click="selectedSubtitleIndex = null; subtitleMenuOpen = false">
                                    <Check class="size-4 shrink-0"
                                        :class="selectedSubtitleIndex === null ? 'opacity-100' : 'opacity-0'" />
                                    Off
                                </div>
                                <div v-for="sub in subtitleList" :key="sub.index"
                                    class="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[0.9rem] transition-colors hover:bg-white/10"
                                    :class="sub.index === selectedSubtitleIndex ? 'bg-accent-purple/20' : ''"
                                    @click="selectedSubtitleIndex = sub.index; subtitleMenuOpen = false">
                                    <Check class="size-4 shrink-0"
                                        :class="sub.index === selectedSubtitleIndex ? 'opacity-100' : 'opacity-0'" />
                                    {{ sub.label }}
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
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { usePreferencesStore } from '@/store/preferences-store';
import Hls from 'hls.js';
import { deviceProfile } from '@/constants';
import { formatTime } from '@/utils/helpers';
import { lockLandscape, unlockOrientation } from '@/utils/orientation';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, AudioLines, Captions, Check, Maximize, Minimize, Loader2 } from 'lucide-vue-next';

// ── Setup ──────────────────────────────────────────────────────────────────────

const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const audioPlayerStore = useAudioPlayerStore();
const preferencesStore = usePreferencesStore();

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

const posterUrl = computed(() => store.getImageUrl(itemId, 'Primary') || '');

let hls: Hls | null = null;
let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
let progressInterval: ReturnType<typeof setInterval> | null = null;
let isSwitching = false;

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
        if (isPlaying.value && !audioMenuOpen.value && !subtitleMenuOpen.value) controlsVisible.value = false;
    }, 3000);
}

function hideControls() {
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (isPlaying.value && !audioMenuOpen.value && !subtitleMenuOpen.value) {
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
    video.currentTime = Math.max(0, ratio * duration.value);
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

async function fetchPlaybackInfo(startTimeTicks?: number, audioStreamIndex?: number, forceTranscode = false) {
    const baseProfile = forceTranscode
        ? { ...deviceProfile.DeviceProfile, DirectPlayProfiles: [] }
        : deviceProfile.DeviceProfile;

    const profile: any = {
        ...deviceProfile,
        DeviceProfile: baseProfile,
        MediaSourceId: itemId,
        ...(startTimeTicks !== undefined ? { StartTimeTicks: startTimeTicks } : {}),
        ...(audioStreamIndex !== undefined ? { AudioStreamIndex: audioStreamIndex } : {}),
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
    subtitleList.value = streams
        .filter(s => s.Type === 'Subtitle' && s.DeliveryUrl)
        .map(s => ({
            index: s.Index as number,
            language: s.Language || 'und',
            label: s.DisplayTitle || `${(s.Language || 'und').toUpperCase()}${s.IsForced ? ' (Forced)' : ''}`,
            deliveryUrl: `${serverUrl}${s.DeliveryUrl}`,
        }));

    const globalSubLang = preferencesStore.preferredSubtitleLanguage;
    const preferred = globalSubLang
        ? subtitleList.value.find(s => s.language === globalSubLang) ?? null
        : null;
    selectedSubtitleIndex.value = preferred?.index ?? null;
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

// ── Player init ────────────────────────────────────────────────────────────────

async function initPlayer(resumeSeconds?: number, preferredAudioIndex?: number, preferredSubtitleIndex?: number) {
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

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(async () => {
    if (audioPlayerStore.isPlaying) audioPlayerStore.stop();
    lockLandscape();

    // Always fetch fresh details — cached currentItem may have stale PlaybackPositionTicks
    let details: any = null;
    try {
        details = await store.fetchItemDetails(itemId);
    } catch (e) {
        console.warn('[Player] Failed to load item details:', e);
    }

    const resumeTicks = details?.UserData?.PlaybackPositionTicks;
    const resumeSeconds = resumeTicks ? resumeTicks / 10_000_000 : undefined;

    // Determine preferred audio: saved user choice → global preferred lang → marked default → first track.
    const allStreams: any[] = details?.MediaStreams || [];
    const audioStreams = allStreams.filter(s => s.Type === 'Audio');
    const savedLang = localStorage.getItem(`msplayer-audio-${itemId}`);
    const savedSubtitles = localStorage.getItem(`msplayer-subtitles-${itemId}`);
    const globalLang = preferencesStore.preferredAudioLanguage;
    const globalLangSubtitles = preferencesStore.preferredSubtitleLanguage;
    const preferred =
        (savedLang ? audioStreams.find((s: any) => s.Language === savedLang) : null) ||
        (globalLang ? audioStreams.find((s: any) => s.Language === globalLang) : null) ||
        audioStreams.find((s: any) => s.IsDefault) ||
        audioStreams[0];
    const preferedSubtitles =
        (savedSubtitles ? audioStreams.find((s: any) => s.Language === savedSubtitles) : null) ||
        (globalLangSubtitles ? audioStreams.find((s: any) => s.Language === globalLangSubtitles) : null) ||
        audioStreams.find((s: any) => s.IsDefault) ||
        audioStreams[0];
    const preferredAudioIndex: number | undefined = preferred?.Index;
    const preferredSubtitleIndex: number | undefined = preferedSubtitles?.Index;

    await initPlayer(resumeSeconds, preferredAudioIndex, preferredSubtitleIndex);

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('fullscreenchange', () => { isFullscreen.value = !!getFullscreenElement(); });
    document.addEventListener('webkitfullscreenchange', () => { isFullscreen.value = !!getFullscreenElement(); });
    document.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
    unlockOrientation();
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleKeyDown);

    if (controlsTimeout) clearTimeout(controlsTimeout);
    stopProgressReporting();
    deleteActiveEncodings();

    hls?.destroy();
    hls = null;

    subtitleBlobCache.forEach(url => URL.revokeObjectURL(url));
    subtitleBlobCache.clear();

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
