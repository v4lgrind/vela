<template>
    <div class="player-page">
        <section v-if="error" class="state error">{{ error }}</section>

        <div class="video-container" @mousemove="showControls" @mouseleave="hideControls">
            <!-- Loader -->
            <div v-if="isLoading" class="loading-overlay">
                <div class="spinner"></div>
                <p class="loading-text">Chargement...</p>
            </div>

            <!-- Vidéo -->
            <video v-if="!isAudioOnly" ref="videoEl" class="player" preload="metadata" playsinline :poster="posterUrl"
                @click="togglePlayPause" @timeupdate="onTimeUpdate" @loadedmetadata="onLoadedMetadata"
                @loadstart="onLoadStart" @canplay="onCanPlay" @waiting="onWaiting" @playing="onPlaying"></video>

            <!-- Audio only -->
            <div v-else class="audio-player" @click="togglePlayPause">
                <audio ref="audioEl" preload="metadata"></audio>

                <div class="audio-display">
                    <img v-if="posterUrl" :src="posterUrl" class="audio-cover" alt="Cover" />
                    <div class="audio-info">
                        <h2 class="audio-title">{{ details?.Name || 'Lecture audio' }}</h2>
                        <p class="audio-artist">
                            {{ details?.AlbumArtist || details?.Artists?.join(', ') || '' }}
                        </p>
                    </div>
                </div>
            </div>

            <!-- Contrôles -->
            <div class="player-controls" :class="{ show: controlsVisible }">
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
                        <!-- Audio tracks (vidéo seulement) -->
                        <div v-if="!isAudioOnly && audioList.length" class="dropdown" ref="audioDropdown">
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
                                    <span class="check">✓</span>
                                    {{ opt.label }}
                                </div>
                            </div>
                        </div>

                        <!-- Sous-titres (vidéo seulement) -->
                        <div v-if="!isAudioOnly && subtitleList.length" class="dropdown" ref="subtitleDropdown">
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
                                    <span class="check">✓</span>
                                    Désactivés
                                </div>
                                <div v-for="opt in subtitleList" :key="opt.id" class="dropdown-item"
                                    :class="{ active: opt.index === parseInt(selectedSubtitleIndex) }"
                                    @click="selectSubtitle(String(opt.index))">
                                    <span class="check">✓</span>
                                    {{ opt.label }}
                                </div>
                                <div class="dropdown-divider"></div>
                                <div class="dropdown-item" @click="selectSubtitle('local')">
                                    <span class="check"></span>
                                    📁 Charger un fichier local…
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
import { useRoute } from 'vue-router';
import { useJellyfinStore } from './store/jellyfin-store';
import shaka from 'shaka-player/dist/shaka-player.compiled.js';
import { deviceProfile } from './constants';
import { formatTime } from './utils/helpers';

const route = useRoute();
const store = useJellyfinStore();

const itemId = route.params.id as string;
const accessToken = store.accessToken || '';
const serverUrl = store.serverUrl;

const videoEl = ref<HTMLVideoElement | null>(null);
const audioEl = ref<HTMLAudioElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const audioDropdown = ref<HTMLElement | null>(null);
const subtitleDropdown = ref<HTMLElement | null>(null);
const error = ref<string | null>(null);

let player: shaka.Player | null = null;
let controlsTimeout: ReturnType<typeof setTimeout> | null = null;

const details = ref<any | null>(null);
const mediaSource = ref<any | null>(null);

const audioList = ref<Array<{ id: number; index: number; label: string; language: string }>>([]);
const selectedAudioIndex = ref<number | null>(null);

const subtitleList = ref<
    Array<{ id: number; index: number; label: string; language: string; codec: string; isExternal: boolean }>
>([]);
const selectedSubtitleIndex = ref<string>('-1');

// État
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

// Type media
const mediaType = ref<'Video' | 'Audio'>('Video');
const isAudioOnly = computed(() => mediaType.value === 'Audio');

function getMediaElement(): HTMLMediaElement | null {
    return isAudioOnly.value ? audioEl.value : videoEl.value;
}

// Reporting Jellyfin
const playSessionId = ref<string>('');
let progressInterval: ReturnType<typeof setInterval> | null = null;

const posterUrl = computed(
    () => store.getImageUrl(itemId, 'Primary') || ''
);

const hlsUrl = ref<string>('');
const baseTranscodingUrl = ref<string>('');
const audioUrl = ref<string>('');

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
        if (isPlaying.value && !audioMenuOpen.value && !subtitleMenuOpen.value) {
            controlsVisible.value = false;
        }
    }, 3000);
}
function hideControls() {
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (isPlaying.value && !audioMenuOpen.value && !subtitleMenuOpen.value) {
        controlsTimeout = setTimeout(() => {
            controlsVisible.value = false;
        }, 1000);
    }
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
        PlayMethod: isAudioOnly.value ? 'DirectStream' : 'Transcode',
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
            !isAudioOnly.value && selectedSubtitleIndex.value !== '-1'
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

function toggleFullscreen() {
    const container = videoEl.value?.parentElement;
    if (!container) return;

    if (!document.fullscreenElement) {
        container.requestFullscreen();
        isFullscreen.value = true;
    } else {
        document.exitFullscreen();
        isFullscreen.value = false;
    }
}

function toggleAudioMenu() {
    audioMenuOpen.value = !audioMenuOpen.value;
    subtitleMenuOpen.value = false;
    showControls();
}
function toggleSubtitleMenu() {
    subtitleMenuOpen.value = !subtitleMenuOpen.value;
    audioMenuOpen.value = false;
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
        error.value = 'Impossible de charger les détails média';
    }
}

async function determineMediaType() {
    try {
        const item = await store.fetchItemDetails(itemId);
        if (item.Type === 'Audio' || item.Type === 'MusicAlbum' || item.MediaType === 'Audio') {
            mediaType.value = 'Audio';
        } else {
            mediaType.value = 'Video';
        }
    } catch (e) {
        mediaType.value = 'Video';
    }
}

async function getPlaybackUrl() {
    try {
        const data = await fetchPlaybackInfo();
        mediaSource.value = data.MediaSources?.[0];
        if (!mediaSource.value) throw new Error('Aucune source média disponible');

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

        if (mediaSource.value.TranscodingUrl) {
            baseTranscodingUrl.value = mediaSource.value.TranscodingUrl;
        }

        buildHlsUrl();
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
    media.addEventListener('play', () => {
        isPlaying.value = true;
        if (!progressInterval) startProgressReporting();
    });
    media.addEventListener('pause', () => {
        isPlaying.value = false;
        reportPlaybackProgress();
    });
    media.addEventListener('ended', () => {
        stopProgressReporting();
    });
}

async function addSubtitleTrack(shakaPlayer: shaka.Player, blobUrl: string, lang: string, label: string) {
    shakaPlayer.setTextTrackVisibility(false);

    await shakaPlayer.addTextTrackAsync(
        blobUrl,
        lang,
        'subtitles',
        'text/vtt',
        null,
        label
    );

    shakaPlayer.setTextTrackVisibility(true);

    const tracks = shakaPlayer.getTextTracks();
    if (tracks.length > 0) {
        shakaPlayer.selectTextTrack(tracks[tracks.length - 1]);
    }
}

async function fetchPlaybackInfo(audioStreamIndex?: number) {
    const profile = {
        ...deviceProfile,
        MediaSourceId: itemId,
        ...(audioStreamIndex !== undefined ? { AudioStreamIndex: audioStreamIndex } : {})
    };

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

// Shaka vidéo
async function initShaka() {
    const video = videoEl.value!;
    try {
        isLoading.value = true;
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

        attachMediaListeners(video);

        await video.play().catch(() => { });
    } catch (e: any) {
        console.error('Erreur init Shaka:', e);
        error.value = "Erreur d'initialisation du lecteur";
        isLoading.value = false;
    }
}

// Audio only (HTML5)
async function initAudioPlayer() {
    const audio = audioEl.value!;
    try {
        isLoading.value = true;

        const params = new URLSearchParams({
            userId: store.userId || '',
            api_key: accessToken,
            MaxStreamingBitrate: '140000000',
            Container: 'opus,webm|opus,mp3,aac,m4a|aac,m4b|aac,flac,webma,webm|webma,wav,ogg',
            TranscodingContainer: 'ts',
            TranscodingProtocol: 'hls',
            AudioCodec: 'aac'
        });

        audioUrl.value = `${serverUrl}/Audio/${itemId}/universal?${params.toString()}`;

        audio.src = audioUrl.value;
        audio.load();

        attachMediaListeners(audio);
        audio.addEventListener('timeupdate', () => {
            currentTime.value = audio.currentTime;
            if (duration.value > 0) {
                progress.value = (audio.currentTime / duration.value) * 100;
            }
        });
        audio.addEventListener('loadedmetadata', () => {
            duration.value = audio.duration;
            volume.value = audio.volume * 100;
            isLoading.value = false;
        });
        audio.addEventListener('canplay', () => {
            isLoading.value = false;
        });
        audio.addEventListener('waiting', () => {
            isLoading.value = true;
        });
        audio.addEventListener('playing', () => {
            isLoading.value = false;
        });

        await audio.play().catch(() => { });
    } catch (e: any) {
        console.error('Erreur init audio player:', e);
        error.value = "Erreur d'initialisation du lecteur audio";
        isLoading.value = false;
    }
}

// Changement de piste audio (vidéo)
async function switchAudio() {
    if (!player || selectedAudioIndex.value === null) return;

    isLoading.value = true;
    const video = videoEl.value!;
    const wasPlaying = !video.paused;
    const savedTime = video.currentTime;

    try {
        video.pause();
        await player.unload();

        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const data = await fetchPlaybackInfo(selectedAudioIndex.value!);
            const newMediaSource = data.MediaSources?.[0];

            if (newMediaSource?.TranscodingUrl) {
                hlsUrl.value = `${serverUrl}${newMediaSource.TranscodingUrl}`;
            } else {
                buildHlsUrl();
            }
        } catch {
            buildHlsUrl();
        }

        await player.load(hlsUrl.value);
        video.currentTime = savedTime;
        if (wasPlaying) await video.play().catch(() => { });
        isLoading.value = false;
        switchSubtitle();
    } catch (e: any) {
        console.error('Erreur switch audio:', e);
        error.value = 'Erreur lors du changement de piste audio';
        isLoading.value = false;
    }
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
    if (!player) return;

    const selected = selectedSubtitleIndex.value;

    if (selected === 'local') {
        fileInput.value?.click();
        return;
    }

    if (selected === '-1') {
        player.setTextTrackVisibility(false);
        return;
    }

    const subIndex = parseInt(selected);
    const subtitle = subtitleList.value.find(s => s.index === subIndex);
    if (!subtitle) return;

    try {
        const mediaSourceId = mediaSource.value?.Id || itemId;
        const vttUrl = `${serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${subIndex}/Stream.vtt?api_key=${accessToken}`;

        // On récupère et nettoie le VTT côté client
        const resp = await fetch(vttUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const raw = await resp.text();
        const cleaned = cleanVttRegions(raw);

        const blob = new Blob([cleaned], { type: 'text/vtt; charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);

        await addSubtitleTrack(player, blobUrl, subtitle.language || 'und', subtitle.label);
    } catch (e: any) {
        console.error('Erreur chargement sous-titres:', e);
        error.value = `Impossible de charger les sous-titres: ${e.message}`;
    }
}

// Conversion SRT → VTT robuste
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
    // Nettoyage éventuel des Region:
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
            error.value = 'Format de sous-titre non supporté';
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
        }
    } catch (err: any) {
        error.value = `Échec de chargement du sous-titre local: ${err.message}`;
        selectedSubtitleIndex.value = '-1';
    } finally {
        if (fileInput.value) fileInput.value.value = '';
    }
}

// Lifecycle
onMounted(async () => {
    await loadDetails();
    await determineMediaType();

    if (isAudioOnly.value) {
        await initAudioPlayer();
    } else {
        await getPlaybackUrl();
        if (hlsUrl.value) {
            await initShaka();
        }
    }

    document.addEventListener('click', e => {
        if (audioDropdown.value && !audioDropdown.value.contains(e.target as Node)) {
            audioMenuOpen.value = false;
        }
        if (subtitleDropdown.value && !subtitleDropdown.value.contains(e.target as Node)) {
            subtitleMenuOpen.value = false;
        }
    });

    document.addEventListener('fullscreenchange', () => {
        isFullscreen.value = !!document.fullscreenElement;
    });

    window.addEventListener('beforeunload', () => {
        stopProgressReporting();
    });
});

onBeforeUnmount(() => {
    // 1. Arrêter l'intervalle EN PREMIER
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }

    // 2. Reporter l'arrêt AVANT de détruire les éléments
    if (getMediaElement()) {
        reportPlaybackStopped();
    }

    // 3. Détruire le player Shaka
    if (player) {
        player.destroy().catch(() => { });
        player = null;
    }

    // 4. Nettoyer l'audio
    if (audioEl.value) {
        audioEl.value.pause();
        audioEl.value.src = '';
    }

    // 5. Nettoyer le timeout des contrôles
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
    display: flex;
    flex-direction: column;
    z-index: 100;
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

/* Audio UI */
.audio-player {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at top, #1a1a2e 0%, #000 70%);
    cursor: pointer;
}

.audio-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 30px;
    padding: 40px;
}

.audio-cover {
    width: 300px;
    height: 300px;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    object-fit: cover;
}

.audio-info {
    text-align: center;
}

.audio-title {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 10px 0;
    color: #fff;
}

.audio-artist {
    font-size: 1.2rem;
    color: #aaa;
    margin: 0;
}

/* Controls */
.player-controls {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    background: linear-gradient(0deg,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.7) 70%,
            transparent 100%);
    padding: 20px 16px 16px;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
}

.player-controls.show {
    opacity: 1;
    pointer-events: all;
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
</style>
