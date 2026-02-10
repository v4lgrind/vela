<template>
    <div class="player-page">
        <section v-if="error" class="state error">{{ error }}</section>

        <div class="video-container" @mousemove="showControls" @mouseleave="hideControls"
            @touchstart="showControls">
            <!-- Loader -->
            <div v-if="isLoading" class="loading-overlay">
                <div class="spinner"></div>
                <p class="loading-text">Chargement...</p>
            </div>

            <!-- Vidéo -->
            <video ref="videoEl" class="player" preload="metadata" playsinline :poster="posterUrl"
                @click="togglePlayPause" @timeupdate="onTimeUpdate" @loadedmetadata="onLoadedMetadata"
                @loadstart="onLoadStart" @canplay="onCanPlay" @waiting="onWaiting" @playing="onPlaying"></video>

            <!-- Contrôles -->
            <div class="player-controls" :class="{ show: controlsVisible }">
                <!-- Back button -->
                <button class="back-btn" @click="goBack">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                    Retour
                </button>

                <!-- Barre de progression -->
                <div class="progress-container" @click="seek">
                    <div class="progress-bar">
                        <div class="progress-filled" :style="{ width: progress + '%' }"></div>
                    </div>
                </div>

                <!-- Bas -->
                <div class="controls-bottom">
                    <div class="controls-left">
                        <!-- Play / Pause -->
                        <button class="control-btn" @click="togglePlayPause">
                            <svg v-if="!isPlaying" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            <svg v-else viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                            </svg>
                        </button>

                        <!-- Volume -->
                        <div class="volume-container">
                            <button class="control-btn" @click="toggleMute">
                                <svg v-if="volume > 50" viewBox="0 0 24 24" fill="currentColor">
                                    <path
                                        d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                                </svg>
                                <svg v-else-if="volume > 0" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7 9v6h4l5 5V4l-5 5H7z" />
                                </svg>
                                <svg v-else viewBox="0 0 24 24" fill="currentColor">
                                    <path
                                        d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                                </svg>
                            </button>
                            <input type="range" min="0" max="100" v-model.number="volume" @input="setVolume"
                                class="volume-slider" />
                        </div>

                        <!-- Temps -->
                        <div class="time-display">
                            {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
                        </div>
                    </div>

                    <div class="controls-right">
                        <!-- Audio tracks -->
                        <div v-if="audioList.length" class="dropdown" ref="audioDropdown">
                            <button class="control-btn" @click="toggleAudioMenu">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path
                                        d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                                </svg>
                                <span class="btn-label">Audio</span>
                            </button>
                            <div class="dropdown-menu" :class="{ show: audioMenuOpen }">
                                <div v-for="opt in audioList" :key="opt.id" class="dropdown-item"
                                    :class="{ active: opt.index === selectedAudioIndex }"
                                    @click="selectAudio(opt.index)">
                                    <span class="check">&#10003;</span>
                                    {{ opt.label }}
                                </div>
                            </div>
                        </div>

                        <!-- Sous-titres -->
                        <div v-if="subtitleList.length" class="dropdown" ref="subtitleDropdown">
                            <button class="control-btn" @click="toggleSubtitleMenu">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path
                                        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z" />
                                </svg>
                                <span class="btn-label">Sous-titres</span>
                            </button>
                            <div class="dropdown-menu" :class="{ show: subtitleMenuOpen }">
                                <div class="dropdown-item" :class="{ active: selectedSubtitleIndex === '-1' }"
                                    @click="selectSubtitle('-1')">
                                    <span class="check">&#10003;</span>
                                    Desactives
                                </div>
                                <div v-for="opt in subtitleList" :key="opt.id" class="dropdown-item"
                                    :class="{ active: opt.index === parseInt(selectedSubtitleIndex) }"
                                    @click="selectSubtitle(String(opt.index))">
                                    <span class="check">&#10003;</span>
                                    {{ opt.label }}
                                </div>
                                <div class="dropdown-divider"></div>
                                <div class="dropdown-item" @click="selectSubtitle('local')">
                                    <span class="check"></span>
                                    Charger un fichier local...
                                </div>
                            </div>
                        </div>

                        <!-- Quality -->
                        <div class="dropdown" ref="qualityDropdown">
                            <button class="control-btn quality-btn" @click="toggleQualityMenu">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                                </svg>
                                <span class="btn-label">{{ qualityLabel }}</span>
                                <span class="play-method-badge">{{ playMethodLabel }}</span>
                            </button>
                            <div class="dropdown-menu" :class="{ show: qualityMenuOpen }">
                                <div v-for="preset in qualityPresets" :key="preset.key" class="dropdown-item"
                                    :class="{ active: preset.key === selectedQuality }"
                                    @click="selectQuality(preset.key)">
                                    <span class="check">&#10003;</span>
                                    {{ preset.label }}
                                </div>
                            </div>
                        </div>

                        <!-- Fullscreen -->
                        <button class="control-btn" @click="toggleFullscreen">
                            <svg v-if="!isFullscreen" viewBox="0 0 24 24" fill="currentColor">
                                <path
                                    d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                            </svg>
                            <svg v-else viewBox="0 0 24 24" fill="currentColor">
                                <path
                                    d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <input ref="fileInput" type="file" accept=".vtt,.srt" class="hidden-input" @change="onPickSubtitleFile" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from './store/jellyfin-store';
import shaka from 'shaka-player/dist/shaka-player.compiled.js';
import { deviceProfile } from './constants';
import { formatTime } from './utils/helpers';
import { lockLandscape, unlockOrientation } from './utils/orientation';
import { useAudioPlayerStore } from './store/audio-player-store';

const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const audioPlayerStore = useAudioPlayerStore();

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
            // iOS Safari: try fullscreen on the video element itself
            if (videoEl.value && (videoEl.value as any).webkitEnterFullscreen) {
                (videoEl.value as any).webkitEnterFullscreen();
                isFullscreen.value = true;
            }
        });
    } else {
        exitFS().catch(() => {});
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

// Chargement info item
async function loadDetails() {
    try {
        details.value =
            store.currentItem?.Id === itemId
                ? store.currentItem
                : await store.fetchItemDetails(itemId);
    } catch (e: any) {
        error.value = 'Impossible de charger les details media';
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
        if (!mediaSource.value) throw new Error('Aucune source media disponible');

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
        console.error('Erreur PlaybackInfo:', e);
        error.value = "Impossible d'obtenir l'URL de lecture";
    }
}

function buildHlsUrl() {
    if (baseTranscodingUrl.value) {
        // Clean leading ?& and use the server's transcoding URL directly
        let transcodingPath = baseTranscodingUrl.value;
        // Replace ?& with ? to avoid malformed query string
        transcodingPath = transcodingPath.replace('?&', '?');
        // Update AudioStreamIndex in the URL
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
    // Remove any previously added dynamic tracks
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

    // Enable the new track, hide others
    for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = i === video.textTracks.length - 1 ? 'showing' : 'hidden';
    }
}

async function fetchPlaybackInfo(audioStreamIndex?: number, maxBitrate?: number) {
    const profile: any = {
        ...deviceProfile,
        MediaSourceId: itemId,
        ...(audioStreamIndex !== undefined ? { AudioStreamIndex: audioStreamIndex } : {}),
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

    try {
        if (playMethod.value === 'DirectPlay') {
            // Native playback - no Shaka needed
            video.src = hlsUrl.value;

            if (seekTo !== undefined) {
                await new Promise<void>(resolve => {
                    const onSeekable = () => {
                        video.currentTime = seekTo;
                        video.removeEventListener('loadedmetadata', onSeekable);
                        resolve();
                    };
                    video.addEventListener('loadedmetadata', onSeekable);
                });
            }

            attachMediaListeners(video);
            setupMediaSession();

            if (resumePlaying !== false) {
                await video.play().catch(() => {});
            }
        } else {
            // HLS playback via Shaka (DirectStream or Transcode)
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
                error.value = `Erreur Shaka ${e.code}: ${e.data?.[2] || 'Erreur de lecture'}`;
                isLoading.value = false;
            });

            await player.load(hlsUrl.value);

            if (seekTo !== undefined) {
                video.currentTime = seekTo;
            }

            attachMediaListeners(video);
            setupMediaSession();

            if (resumePlaying !== false) {
                await video.play().catch(() => {});
            }
        }

        // Auto-fullscreen on mobile (only on initial load, not on reload)
        if (seekTo === undefined && isMobile()) {
            const container = videoEl.value?.parentElement;
            if (container) {
                requestFS(container).then(() => {
                    isFullscreen.value = true;
                }).catch(() => {});
            }
        }
    } catch (e: any) {
        console.error('Erreur init player:', e);
        error.value = "Erreur d'initialisation du lecteur";
        isLoading.value = false;
    }
}

// Teardown current player (Shaka or native)
async function teardownPlayer() {
    const video = videoEl.value;
    if (player) {
        await player.unload().catch(() => {});
        await player.destroy().catch(() => {});
        player = null;
    }
    if (video) {
        video.removeAttribute('src');
        video.load();
    }
}

// Changement de piste audio
async function switchAudio() {
    if (selectedAudioIndex.value === null) return;

    isLoading.value = true;
    const video = videoEl.value!;
    const wasPlaying = !video.paused;
    const savedTime = video.currentTime;

    try {
        video.pause();
        await teardownPlayer();

        await new Promise(resolve => setTimeout(resolve, 100));

        // Re-fetch with new audio stream
        const maxBitrate = selectedQuality.value !== 'auto'
            ? qualityPresets.find(p => p.key === selectedQuality.value)?.bitrate
            : undefined;

        try {
            const data = await fetchPlaybackInfo(selectedAudioIndex.value!, maxBitrate);
            const ms = data.MediaSources?.[0];
            if (ms) {
                mediaSource.value = ms;
                baseTranscodingUrl.value = '';
                determinePlaybackMethod(ms);
            }
        } catch {
            buildHlsUrl();
        }

        await initPlayer(savedTime, wasPlaying);
        isLoading.value = false;
        switchSubtitle();
    } catch (e: any) {
        console.error('Erreur switch audio:', e);
        error.value = 'Erreur lors du changement de piste audio';
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

    await teardownPlayer();
    await new Promise(resolve => setTimeout(resolve, 100));

    // Re-fetch playback info with new bitrate
    const maxBitrate = key !== 'auto'
        ? qualityPresets.find(p => p.key === key)?.bitrate
        : undefined;

    try {
        const data = await fetchPlaybackInfo(selectedAudioIndex.value ?? undefined, maxBitrate);
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
        console.error('Erreur switch quality:', e);
        error.value = 'Erreur lors du changement de qualite';
        isLoading.value = false;
        return;
    }

    if (hlsUrl.value) {
        await initPlayer(savedTime, wasPlaying);
    }

    switchSubtitle();
}

// Nettoyage VTT: suppression des lignes Region:
function cleanVttRegions(vtt: string): string {
    return vtt
        .split('\n')
        .filter(line => !line.trim().startsWith('Region:'))
        .join('\n');
}

// Sous-titres distants via Jellyfin
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
            // Native: hide all text tracks
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

        // On recupere et nettoie le VTT cote client
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
        console.error('Erreur chargement sous-titres:', e);
        error.value = `Impossible de charger les sous-titres: ${e.message}`;
    }
}

// Conversion SRT -> VTT robuste
function srtToVtt(srt: string) {
    let vtt = srt
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();

    // Remove sequence numbers
    vtt = vtt.replace(/^\d+\s*$/gm, '');
    // Replace commas by dots in timestamps
    vtt = vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    // Remove multiple empty lines
    vtt = vtt.replace(/\n{3,}/g, '\n\n');

    vtt = `WEBVTT\n\n${vtt}`;
    // Nettoyage eventuel des Region:
    return cleanVttRegions(vtt);
}

// Sous-titre local
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
            error.value = 'Format de sous-titre non supporte';
            selectedSubtitleIndex.value = '-1';
            return;
        }

        // Nettoyage Region:
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
        error.value = `Echec de chargement du sous-titre local: ${err.message}`;
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

// Lifecycle
onMounted(async () => {
    // Stop any background audio playback before starting video
    if (audioPlayerStore.isPlaying) {
        audioPlayerStore.stop();
    }

    await loadDetails();
    await lockLandscape();

    await getPlaybackUrl();
    if (hlsUrl.value) {
        await initPlayer();
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

    // 1. Stop interval first
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }

    // 2. Report stop before destroying elements
    if (getMediaElement()) {
        reportPlaybackStopped();
    }

    // 3. Destroy Shaka player if present
    if (player) {
        player.destroy().catch(() => { });
        player = null;
    }

    // 4. Clean controls timeout
    if (controlsTimeout) {
        clearTimeout(controlsTimeout);
        controlsTimeout = null;
    }
});

</script>

<style scoped>
.player-page {
    position: fixed;
    inset: 0;
    background: #000;
    color: #e0e0e0;
    padding: 0;
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
    display: flex;
    flex-direction: column;
    z-index: 100;
    height: 100vh;
    height: 100dvh; /* mobile: accounts for browser chrome */
}

.state.error {
    position: absolute;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    color: #ff6b6b;
    background: rgba(0, 0, 0, 0.9);
    padding: 12px 24px;
    border-radius: 8px;
}

.video-container {
    position: relative;
    width: 100%;
    height: 100%;
    flex: 1;
    overflow: hidden;
    background: #000;
}

.player {
    width: 100%;
    height: 100%;
    background: #000;
}

/* Loader */
.loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 50;
}

.spinner {
    width: 60px;
    height: 60px;
    border: 4px solid rgba(255, 255, 255, 0.1);
    border-top-color: #00a4dc;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.loading-text {
    margin-top: 20px;
    color: #fff;
    font-size: 1rem;
    font-weight: 500;
}

/* Controls */
.player-controls {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    background: linear-gradient(0deg,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.4) 30%,
            transparent 50%,
            rgba(0, 0, 0, 0.4) 85%,
            rgba(0, 0, 0, 0.7) 100%);
    padding: 20px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
}

.player-controls.show {
    opacity: 1;
    pointer-events: all;
}

.back-btn {
    position: absolute;
    top: env(safe-area-inset-top, 12px);
    left: 12px;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    color: #fff;
    cursor: pointer;
    padding: 8px 14px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.95rem;
    font-weight: 500;
    transition: background 0.2s ease;
    z-index: 10;
}

.back-btn:hover {
    background: rgba(255, 255, 255, 0.15);
}

.back-btn svg {
    width: 20px;
    height: 20px;
}

.progress-container {
    width: 100%;
    height: 24px;
    display: flex;
    align-items: center;
    cursor: pointer;
    margin-bottom: 12px;
}

.progress-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    position: relative;
    transition: height 0.2s ease;
}

.progress-container:hover .progress-bar {
    height: 6px;
}

.progress-filled {
    height: 100%;
    background: #00a4dc;
    border-radius: 2px;
    transition: width 0.1s ease;
}

.controls-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.controls-left,
.controls-right {
    display: flex;
    align-items: center;
    gap: 8px;
}

.control-btn {
    background: transparent;
    border: none;
    color: #fff;
    cursor: pointer;
    padding: 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background 0.2s ease;
}

.control-btn:hover {
    background: rgba(255, 255, 255, 0.1);
}

.control-btn svg {
    width: 24px;
    height: 24px;
}

.btn-label {
    font-size: 0.9rem;
    font-weight: 500;
}

.volume-container {
    display: flex;
    align-items: center;
    gap: 8px;
}

.volume-slider {
    width: 80px;
    height: 4px;
    appearance: none;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    background: #fff;
    border-radius: 50%;
    cursor: pointer;
}

.volume-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: #fff;
    border-radius: 50%;
    cursor: pointer;
    border: none;
}

.time-display {
    font-size: 0.9rem;
    color: #fff;
    font-variant-numeric: tabular-nums;
    min-width: 110px;
}

/* Dropdowns */
.dropdown {
    position: relative;
}

.dropdown-menu {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 8px;
    background: rgba(28, 28, 28, 0.98);
    border-radius: 8px;
    min-width: 250px;
    max-height: 400px;
    overflow-y: auto;
    opacity: 0;
    pointer-events: none;
    transform: translateY(10px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
}

.dropdown-menu.show {
    opacity: 1;
    pointer-events: all;
    transform: translateY(0);
}

.dropdown-item {
    padding: 12px 16px;
    cursor: pointer;
    transition: background 0.2s ease;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
}

.dropdown-item:hover {
    background: rgba(255, 255, 255, 0.1);
}

.dropdown-item.active {
    background: rgba(0, 164, 220, 0.2);
}

.dropdown-item .check {
    width: 16px;
    font-size: 0.9rem;
    opacity: 0;
}

.dropdown-item.active .check {
    opacity: 1;
}

.dropdown-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 4px 0;
}

.hidden-input {
    display: none;
}

.dropdown-menu::-webkit-scrollbar {
    width: 8px;
}

.dropdown-menu::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
}

.dropdown-menu::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
}

.dropdown-menu::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* Quality button & play method badge */
.quality-btn {
    flex-wrap: wrap;
    justify-content: center;
}

.play-method-badge {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: rgba(0, 164, 220, 0.3);
    color: #7dd3fc;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
}
</style>
