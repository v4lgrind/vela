<template>
    <div class="player-page">
        <section v-if="error" class="state error">{{ error }}</section>

        <div class="video-container" @mousemove="showControls" @mouseleave="hideControls">
            <video ref="videoEl" class="player" preload="metadata" playsinline :poster="posterUrl"
                @click="togglePlayPause" @timeupdate="onTimeUpdate" @loadedmetadata="onLoadedMetadata"></video>

            <!-- Contrôles personnalisés -->
            <div class="player-controls" :class="{ 'show': controlsVisible }">
                <!-- Barre de progression -->
                <div class="progress-container" @click="seek">
                    <div class="progress-bar">
                        <div class="progress-filled" :style="{ width: progress + '%' }"></div>
                    </div>
                </div>

                <!-- Contrôles du bas -->
                <div class="controls-bottom">
                    <div class="controls-left">
                        <button class="control-btn" @click="togglePlayPause">
                            <svg v-if="!isPlaying" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            <svg v-else viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                            </svg>
                        </button>

                        <div class="volume-container">
                            <button class="control-btn" @click="toggleMute">
                                <svg v-if="volume > 0.5" viewBox="0 0 24 24" fill="currentColor">
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
                            <input type="range" min="0" max="100" v-model="volume" @input="setVolume"
                                class="volume-slider" />
                        </div>

                        <div class="time-display">
                            {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
                        </div>
                    </div>

                    <div class="controls-right">
                        <!-- Bouton Audio -->
                        <div class="dropdown" ref="audioDropdown">
                            <button class="control-btn" @click="toggleAudioMenu">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path
                                        d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                                </svg>
                                <span class="btn-label">Audio</span>
                            </button>
                            <div class="dropdown-menu" :class="{ 'show': audioMenuOpen }">
                                <div v-for="opt in audioList" :key="opt.id" class="dropdown-item"
                                    :class="{ 'active': opt.index === selectedAudioIndex }"
                                    @click="selectAudio(opt.index)">
                                    <span class="check">✓</span>
                                    {{ opt.label }}
                                </div>
                            </div>
                        </div>

                        <!-- Bouton Sous-titres -->
                        <div class="dropdown" ref="subtitleDropdown">
                            <button class="control-btn" @click="toggleSubtitleMenu">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path
                                        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z" />
                                </svg>
                                <span class="btn-label">Sous-titres</span>
                            </button>
                            <div class="dropdown-menu" :class="{ 'show': subtitleMenuOpen }">
                                <div class="dropdown-item" :class="{ 'active': selectedSubtitleIndex === '-1' }"
                                    @click="selectSubtitle('-1')">
                                    <span class="check">✓</span>
                                    Désactivés
                                </div>
                                <div v-for="opt in subtitleList" :key="opt.id" class="dropdown-item"
                                    :class="{ 'active': opt.index === parseInt(selectedSubtitleIndex) }"
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

                        <!-- Bouton Fullscreen -->
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

const route = useRoute();
const store = useJellyfinStore();

const itemId = route.params.id as string;
const accessToken = store.accessToken || '';
const serverUrl = store.serverUrl;

const videoEl = ref<HTMLVideoElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const audioDropdown = ref<HTMLElement | null>(null);
const subtitleDropdown = ref<HTMLElement | null>(null);
const error = ref<string | null>(null);

let player: shaka.Player | null = null;
let controlsTimeout: NodeJS.Timeout | null = null;

const details = ref<any | null>(null);
const mediaSource = ref<any | null>(null);

const audioList = ref<Array<{ id: number; index: number; label: string; language: string }>>([]);
const selectedAudioIndex = ref<number | null>(null);

const subtitleList = ref<Array<{ id: number; index: number; label: string; language: string; codec: string; isExternal: boolean }>>([]);
const selectedSubtitleIndex = ref<string>('-1');

// État du player
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const progress = ref(0);
const volume = ref(100);
const isFullscreen = ref(false);
const controlsVisible = ref(true);
const audioMenuOpen = ref(false);
const subtitleMenuOpen = ref(false);

const deviceProfile = {
    "StartTimeTicks": 0,
    "IsPlayback": true,
    "AutoOpenLiveStream": true,
    "AudioStreamIndex": null,
    "SubtitleStreamIndex": null,
    "MaxStreamingBitrate": 140000000,
    "AlwaysBurnInSubtitleWhenTranscoding": false,
    "EnableAllProbes": true,
    "DeviceProfile": {
        "MaxStreamingBitrate": 120000000,
        "MaxStaticBitrate": 100000000,
        "MusicStreamingTranscodingBitrate": 384000,
        "DirectPlayProfiles": [
            {
                "Container": "webm",
                "Type": "Video",
                "VideoCodec": "vp8,vp9,av1",
                "AudioCodec": "vorbis,opus"
            },
            {
                "Container": "mp4,m4v",
                "Type": "Video",
                "VideoCodec": "h264,hevc,vp9,av1",
                "AudioCodec": "aac,mp3,mp2,opus,flac,vorbis"
            },
            {
                "Container": "mov",
                "Type": "Video",
                "VideoCodec": "h264",
                "AudioCodec": "aac,mp3,mp2,opus,flac,vorbis"
            },
            { "Container": "opus", "Type": "Audio" },
            { "Container": "webm", "AudioCodec": "opus", "Type": "Audio" },
            { "Container": "ts", "AudioCodec": "mp3", "Type": "Audio" },
            { "Container": "mp3", "Type": "Audio" },
            { "Container": "aac", "Type": "Audio" },
            { "Container": "m4a", "AudioCodec": "aac", "Type": "Audio" },
            { "Container": "m4b", "AudioCodec": "aac", "Type": "Audio" },
            { "Container": "flac", "Type": "Audio" },
            { "Container": "webma", "Type": "Audio" },
            { "Container": "webm", "AudioCodec": "webma", "Type": "Audio" },
            { "Container": "wav", "Type": "Audio" },
            { "Container": "ogg", "Type": "Audio" },
            {
                "Container": "hls",
                "Type": "Video",
                "VideoCodec": "av1,hevc,h264,vp9",
                "AudioCodec": "aac,mp2,opus,flac"
            },
            {
                "Container": "hls",
                "Type": "Video",
                "VideoCodec": "h264",
                "AudioCodec": "aac,mp3,mp2"
            }
        ],
        "TranscodingProfiles": [
            {
                "Container": "mp4",
                "Type": "Audio",
                "AudioCodec": "aac",
                "Context": "Streaming",
                "Protocol": "hls",
                "MaxAudioChannels": "2",
                "MinSegments": "1",
                "BreakOnNonKeyFrames": true,
                "EnableAudioVbrEncoding": true
            },
            {
                "Container": "aac",
                "Type": "Audio",
                "AudioCodec": "aac",
                "Context": "Streaming",
                "Protocol": "http",
                "MaxAudioChannels": "2"
            },
            {
                "Container": "mp3",
                "Type": "Audio",
                "AudioCodec": "mp3",
                "Context": "Streaming",
                "Protocol": "http",
                "MaxAudioChannels": "2"
            },
            {
                "Container": "opus",
                "Type": "Audio",
                "AudioCodec": "opus",
                "Context": "Streaming",
                "Protocol": "http",
                "MaxAudioChannels": "2"
            },
            {
                "Container": "wav",
                "Type": "Audio",
                "AudioCodec": "wav",
                "Context": "Streaming",
                "Protocol": "http",
                "MaxAudioChannels": "2"
            },
            {
                "Container": "opus",
                "Type": "Audio",
                "AudioCodec": "opus",
                "Context": "Static",
                "Protocol": "http",
                "MaxAudioChannels": "2"
            },
            {
                "Container": "mp3",
                "Type": "Audio",
                "AudioCodec": "mp3",
                "Context": "Static",
                "Protocol": "http",
                "MaxAudioChannels": "2"
            },
            {
                "Container": "aac",
                "Type": "Audio",
                "AudioCodec": "aac",
                "Context": "Static",
                "Protocol": "http",
                "MaxAudioChannels": "2"
            },
            {
                "Container": "wav",
                "Type": "Audio",
                "AudioCodec": "wav",
                "Context": "Static",
                "Protocol": "http",
                "MaxAudioChannels": "2"
            },
            {
                "Container": "mp4",
                "Type": "Video",
                "AudioCodec": "aac,mp2,opus,flac",
                "VideoCodec": "av1,hevc,h264,vp9",
                "Context": "Streaming",
                "Protocol": "hls",
                "MaxAudioChannels": "2",
                "MinSegments": "1",
                "BreakOnNonKeyFrames": true
            },
            {
                "Container": "ts",
                "Type": "Video",
                "AudioCodec": "aac,mp3,mp2",
                "VideoCodec": "h264",
                "Context": "Streaming",
                "Protocol": "hls",
                "MaxAudioChannels": "2",
                "MinSegments": "1",
                "BreakOnNonKeyFrames": true,
                "EnableSubtitlesInManifest": true
            }
        ],
        "ContainerProfiles": [],
        "CodecProfiles": [
            {
                "Type": "VideoAudio",
                "Codec": "aac",
                "Conditions": [
                    {
                        "Condition": "Equals",
                        "Property": "IsSecondaryAudio",
                        "Value": "false",
                        "IsRequired": false
                    }
                ]
            },
            {
                "Type": "VideoAudio",
                "Conditions": [
                    {
                        "Condition": "Equals",
                        "Property": "IsSecondaryAudio",
                        "Value": "false",
                        "IsRequired": false
                    }
                ]
            },
            {
                "Type": "Video",
                "Codec": "h264",
                "Conditions": [
                    {
                        "Condition": "NotEquals",
                        "Property": "IsAnamorphic",
                        "Value": "true",
                        "IsRequired": false
                    },
                    {
                        "Condition": "EqualsAny",
                        "Property": "VideoProfile",
                        "Value": "high|main|baseline|constrained baseline|high 10",
                        "IsRequired": false
                    },
                    {
                        "Condition": "EqualsAny",
                        "Property": "VideoRangeType",
                        "Value": "SDR",
                        "IsRequired": false
                    },
                    {
                        "Condition": "LessThanEqual",
                        "Property": "VideoLevel",
                        "Value": "52",
                        "IsRequired": false
                    },
                    {
                        "Condition": "NotEquals",
                        "Property": "IsInterlaced",
                        "Value": "true",
                        "IsRequired": false
                    }
                ]
            },
            {
                "Type": "Video",
                "Codec": "hevc",
                "Conditions": [
                    {
                        "Condition": "NotEquals",
                        "Property": "IsAnamorphic",
                        "Value": "true",
                        "IsRequired": false
                    },
                    {
                        "Condition": "EqualsAny",
                        "Property": "VideoProfile",
                        "Value": "main|main 10",
                        "IsRequired": false
                    },
                    {
                        "Condition": "EqualsAny",
                        "Property": "VideoRangeType",
                        "Value": "SDR|HDR10|HLG",
                        "IsRequired": false
                    },
                    {
                        "Condition": "LessThanEqual",
                        "Property": "VideoLevel",
                        "Value": "183",
                        "IsRequired": false
                    },
                    {
                        "Condition": "NotEquals",
                        "Property": "IsInterlaced",
                        "Value": "true",
                        "IsRequired": false
                    }
                ]
            },
            {
                "Type": "Video",
                "Codec": "vp9",
                "Conditions": [
                    {
                        "Condition": "EqualsAny",
                        "Property": "VideoRangeType",
                        "Value": "SDR|HDR10|HLG",
                        "IsRequired": false
                    }
                ]
            },
            {
                "Type": "Video",
                "Codec": "av1",
                "Conditions": [
                    {
                        "Condition": "NotEquals",
                        "Property": "IsAnamorphic",
                        "Value": "true",
                        "IsRequired": false
                    },
                    {
                        "Condition": "EqualsAny",
                        "Property": "VideoProfile",
                        "Value": "main",
                        "IsRequired": false
                    },
                    {
                        "Condition": "EqualsAny",
                        "Property": "VideoRangeType",
                        "Value": "SDR|HDR10|HLG",
                        "IsRequired": false
                    },
                    {
                        "Condition": "LessThanEqual",
                        "Property": "VideoLevel",
                        "Value": "19",
                        "IsRequired": false
                    }
                ]
            }
        ],
        "SubtitleProfiles": [
            { "Format": "vtt", "Method": "External" },
            { "Format": "ass", "Method": "External" },
            { "Format": "ssa", "Method": "External" }
        ],
        "ResponseProfiles": [
            { "Type": "Video", "Container": "m4v", "MimeType": "video/mp4" }
        ]
    }
};

const posterUrl = computed(
    () => store.getImageUrl(itemId, 'Primary') || ''
);

const hlsUrl = ref<string>('');
const baseTranscodingUrl = ref<string>('');

function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
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

function togglePlayPause() {
    const video = videoEl.value!;
    if (video.paused) {
        video.play();
        isPlaying.value = true;
    } else {
        video.pause();
        isPlaying.value = false;
    }
}

function toggleMute() {
    const video = videoEl.value!;
    video.muted = !video.muted;
    if (video.muted) {
        volume.value = 0;
    } else {
        volume.value = video.volume * 100;
    }
}

function setVolume() {
    const video = videoEl.value!;
    video.volume = volume.value / 100;
    video.muted = volume.value === 0;
}

function seek(e: MouseEvent) {
    const progressBar = (e.currentTarget as HTMLElement);
    const clickX = e.offsetX;
    const width = progressBar.offsetWidth;
    const video = videoEl.value!;
    video.currentTime = (clickX / width) * duration.value;
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
    const video = videoEl.value!;
    currentTime.value = video.currentTime;
    if (duration.value > 0) {
        progress.value = (video.currentTime / duration.value) * 100;
    }
}

function onLoadedMetadata() {
    const video = videoEl.value!;
    duration.value = video.duration;
    volume.value = video.volume * 100;
}

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

async function getPlaybackUrl() {
    try {
        const profile = { ...deviceProfile, MediaSourceId: itemId };

        const response = await fetch(
            `${serverUrl}/Items/${itemId}/PlaybackInfo?userId=${store.userId}&api_key=${accessToken}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(profile)
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        mediaSource.value = data.MediaSources?.[0];

        if (!mediaSource.value) {
            throw new Error('Aucune source média disponible');
        }

        const audioStreams = (mediaSource.value.MediaStreams || []).filter((s: any) => s.Type === 'Audio');
        audioList.value = audioStreams.map((s: any) => ({
            id: s.Index,
            index: s.Index,
            language: s.Language || 'und',
            label: `${(s.Language || 'und').toUpperCase()} ${s.ChannelLayout ? `(${s.ChannelLayout})` : s.Channels ? `(${s.Channels}ch)` : ''
                } ${s.Codec ? `- ${s.Codec.toUpperCase()}` : ''}`.trim()
        }));

        const subtitleStreams = (mediaSource.value.MediaStreams || []).filter((s: any) => s.Type === 'Subtitle');
        subtitleList.value = subtitleStreams.map((s: any) => ({
            id: s.Index,
            index: s.Index,
            language: s.Language || 'und',
            codec: s.Codec,
            isExternal: s.IsExternal || false,
            label: `${(s.Language || 'und').toUpperCase()} ${s.Title ? `- ${s.Title}` : ''} ${s.IsForced ? '(Forced)' : ''}`.trim()
        }));

        const frenchStream = audioStreams.find((s: any) =>
            s.Language === 'fra' || s.Language === 'fre' || s.Language === 'fr'
        );
        const defaultStream = frenchStream || audioStreams.find((s: any) => s.IsDefault) || audioStreams[0];
        selectedAudioIndex.value = defaultStream?.Index ?? 0;

        if (mediaSource.value.TranscodingUrl) {
            baseTranscodingUrl.value = mediaSource.value.TranscodingUrl;
        }

        buildHlsUrl();

    } catch (e: any) {
        console.error('Erreur PlaybackInfo:', e);
        error.value = 'Impossible d\'obtenir l\'URL de lecture';
    }
}

function buildHlsUrl() {
    if (baseTranscodingUrl.value) {
        const url = new URL(`${serverUrl}${baseTranscodingUrl.value}`);
        url.searchParams.set('AudioStreamIndex', String(selectedAudioIndex.value));
        hlsUrl.value = url.toString();
    } else {
        hlsUrl.value = `${serverUrl}/Videos/${itemId}/master.m3u8?mediaSourceId=${mediaSource.value?.Id || itemId}&AudioStreamIndex=${selectedAudioIndex.value}&api_key=${accessToken}`;
    }
    console.log('HLS URL:', hlsUrl.value);
}

async function initShaka() {
    const video = videoEl.value!;

    try {
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
        });

        await player.load(hlsUrl.value);

        video.addEventListener('play', () => { isPlaying.value = true; });
        video.addEventListener('pause', () => { isPlaying.value = false; });

        video.play().catch(() => { });
    } catch (e: any) {
        console.error('Erreur init Shaka:', e);
        error.value = 'Erreur d\'initialisation du lecteur';
    }
}

async function switchAudio() {
    if (!player || selectedAudioIndex.value === null) return;

    console.log('Switching to audio index:', selectedAudioIndex.value);

    const video = videoEl.value!;
    const wasPlaying = !video.paused;
    const savedTime = video.currentTime;

    try {
        video.pause();
        video.removeAttribute('src');
        video.load();

        if (player) {
            await player.unload();
            await player.destroy();
            player = null;
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        const profile = {
            ...deviceProfile,
            MediaSourceId: itemId,
            AudioStreamIndex: selectedAudioIndex.value
        };

        const response = await fetch(
            `${serverUrl}/Items/${itemId}/PlaybackInfo?userId=${store.userId}&api_key=${accessToken}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(profile)
            }
        );

        if (response.ok) {
            const data = await response.json();
            const newMediaSource = data.MediaSources?.[0];

            if (newMediaSource?.TranscodingUrl) {
                hlsUrl.value = `${serverUrl}${newMediaSource.TranscodingUrl}`;
            } else {
                buildHlsUrl();
            }
        } else {
            buildHlsUrl();
        }

        await initShaka();

        video.currentTime = savedTime;
        if (wasPlaying) {
            await video.play().catch(() => { });
        }

    } catch (e: any) {
        console.error('Erreur switch audio:', e);
        error.value = 'Erreur lors du changement de piste audio';
    }
}

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
        const vttUrl = `${serverUrl}/Videos/${itemId}/${mediaSource.value?.Id || itemId}/Subtitles/${subIndex}/0/Stream.vtt?api_key=${accessToken}`;

        await player.addTextTrackAsync(
            vttUrl,
            subtitle.language || 'und',
            'subtitles',
            'text/vtt',
            subtitle.codec,
            subtitle.label
        );

        player.setTextTrackVisibility(true);

        const tracks = player.getTextTracks();
        if (tracks.length > 0) {
            player.selectTextTrack(tracks[tracks.length - 1]);
        }

    } catch (e: any) {
        console.error('Erreur chargement sous-titres:', e);
        error.value = 'Impossible de charger les sous-titres';
    }
}

function srtToVtt(srt: string) {
    const vttBody = srt
        .replace(/\r/g, '')
        .replace(/^\d+\s*$/gm, '')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return `WEBVTT\n\n${vttBody}`;
}

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
            vttContent = text;
        } else if (isSrt) {
            vttContent = srtToVtt(text);
        } else {
            error.value = 'Format de sous-titre non supporté';
            selectedSubtitleIndex.value = '-1';
            return;
        }

        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const blobUrl = URL.createObjectURL(blob);

        const m = name.match(/\.(fr|eng|en|spa|es|de|it|pt|jp|ja|zh|ru)\./i);
        const lang = m ? m[1].toLowerCase() : 'und';

        if (player) {
            await player.addTextTrackAsync(
                blobUrl,
                lang,
                'subtitles',
                'text/vtt',
                '',
                name
            );

            player.setTextTrackVisibility(true);

            const tracks = player.getTextTracks();
            if (tracks.length > 0) {
                player.selectTextTrack(tracks[tracks.length - 1]);
            }
        }

    } catch (err) {
        error.value = 'Échec de chargement du sous-titre local';
        selectedSubtitleIndex.value = '-1';
    } finally {
        if (fileInput.value) fileInput.value.value = '';
    }
}

onMounted(async () => {
    await loadDetails();
    await getPlaybackUrl();
    if (hlsUrl.value) {
        await initShaka();
    }

    document.addEventListener('click', (e) => {
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
});

onBeforeUnmount(() => {
    if (player) {
        player.destroy().catch(() => { });
        player = null;
    }
    if (controlsTimeout) clearTimeout(controlsTimeout);
});
</script>

<style scoped>
.player-page {
    height: 92%;
    background: #000;
    color: #e0e0e0;
    padding: 0;
    display: flex;
    flex-direction: column;
}

.player-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
}

.title {
    margin: 0;
    justify-self: center;
    font-size: 1.4rem;
    font-weight: 600;
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
    width: 100vw;
    height: 93vh;
    background: #000;
}

.player {
    width: 100%;
    height: 100%;
    background: #000;
}

.player-controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.7) 70%, transparent 100%);
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
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
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

.btn {
    height: 40px;
    padding: 0 16px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: transform .15s ease, background .2s ease;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
}

.btn:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
}

.btn.ghost {
    background: transparent;
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
