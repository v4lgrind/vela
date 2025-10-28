<template>
    <div class="player-page">
        <header class="player-header">
            <button class="btn ghost" @click="$router.back()">← Retour</button>
            <h2 class="title">Lecture</h2>
        </header>

        <section v-if="error" class="state error">{{ error }}</section>

        <div class="video-container">
            <video ref="videoEl" class="player" controls preload="metadata" playsinline :poster="posterUrl">
            </video>
        </div>

        <div class="tracks-controls">
            <div class="control">
                <label>Audio</label>
                <select v-model="selectedAudioIndex" @change="switchAudio">
                    <option v-for="opt in audioList" :key="opt.id" :value="opt.index">
                        {{ opt.label }}
                    </option>
                </select>
            </div>

            <div class="control">
                <label>Sous-titres</label>
                <select v-model="selectedSubtitleIndex" @change="switchSubtitle">
                    <option value="-1">Désactivés</option>
                    <option v-for="opt in subtitleList" :key="opt.id" :value="opt.index">
                        {{ opt.label }}
                    </option>
                    <option value="local">Charger un fichier local…</option>
                </select>
                <input ref="fileInput" type="file" accept=".vtt,.srt" class="hidden-input"
                    @change="onPickSubtitleFile" />
            </div>
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
const error = ref<string | null>(null);

let player: shaka.Player | null = null;

const details = ref<any | null>(null);
const mediaSource = ref<any | null>(null);

const audioList = ref<Array<{ id: number; index: number; label: string; language: string }>>([]);
const selectedAudioIndex = ref<number | null>(null);

const subtitleList = ref<Array<{ id: number; index: number; label: string; language: string; codec: string; isExternal: boolean }>>([]);
const selectedSubtitleIndex = ref<string>('-1');

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
    () => store.getImageUrl(itemId, 'Primary', 640, 360) || ''
);

const hlsUrl = ref<string>('');
const baseTranscodingUrl = ref<string>('');

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

        console.log('MediaSource:', mediaSource.value);

        // Construire la liste audio
        const audioStreams = (mediaSource.value.MediaStreams || []).filter((s: any) => s.Type === 'Audio');
        audioList.value = audioStreams.map((s: any) => ({
            id: s.Index,
            index: s.Index,
            language: s.Language || 'und',
            label: `${(s.Language || 'und').toUpperCase()} ${s.ChannelLayout ? `(${s.ChannelLayout})` : s.Channels ? `(${s.Channels}ch)` : ''
                } ${s.Codec ? `- ${s.Codec.toUpperCase()}` : ''}`.trim()
        }));

        // Construire la liste des sous-titres
        const subtitleStreams = (mediaSource.value.MediaStreams || []).filter((s: any) => s.Type === 'Subtitle');
        subtitleList.value = subtitleStreams.map((s: any) => ({
            id: s.Index,
            index: s.Index,
            language: s.Language || 'und',
            codec: s.Codec,
            isExternal: s.IsExternal || false,
            label: `${(s.Language || 'und').toUpperCase()} ${s.Title ? `- ${s.Title}` : ''} ${s.IsForced ? '(Forced)' : ''} ${s.Codec ? `[${s.Codec.toUpperCase()}]` : ''}`.trim()
        }));

        // Sélection par défaut audio (français en priorité)
        const frenchStream = audioStreams.find((s: any) =>
            s.Language === 'fra' || s.Language === 'fre' || s.Language === 'fr'
        );
        const defaultStream = frenchStream || audioStreams.find((s: any) => s.IsDefault) || audioStreams[0];
        console.log('Default audio stream:', defaultStream);
        selectedAudioIndex.value = defaultStream?.Index ?? 0;
        console.log('Selected audio index:', selectedAudioIndex.value);

        // Sauvegarder l'URL de base
        if (mediaSource.value.TranscodingUrl) {
            baseTranscodingUrl.value = mediaSource.value.TranscodingUrl;
        }

        // Construire l'URL initiale
        buildHlsUrl();

    } catch (e: any) {
        console.error('Erreur PlaybackInfo:', e);
        error.value = 'Impossible d\'obtenir l\'URL de lecture';
    }
}

function buildHlsUrl() {
    if (baseTranscodingUrl.value) {
        // TranscodingUrl contient déjà tous les paramètres
        const url = new URL(`${serverUrl}${baseTranscodingUrl.value}`);

        // Remplacer l'AudioStreamIndex existant au lieu de l'ajouter
        url.searchParams.set('AudioStreamIndex', String(selectedAudioIndex.value));

        hlsUrl.value = url.toString();
    } else {
        // Fallback: construire manuellement
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
    const currentTime = video.currentTime;

    try {
        // Nettoyer
        video.pause();
        video.removeAttribute('src');
        video.load();

        if (player) {
            await player.unload();
            await player.destroy();
            player = null;
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        // IMPORTANT: Recréer une nouvelle session avec le bon AudioStreamIndex
        const profile = {
            ...deviceProfile,
            MediaSourceId: itemId,
            AudioStreamIndex: selectedAudioIndex.value  // Spécifier l'index audio voulu
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
                console.log('New HLS URL with audio index:', hlsUrl.value);
            } else {
                buildHlsUrl();
            }
        } else {
            buildHlsUrl();
        }

        // Réinitialiser Shaka avec la nouvelle URL
        await initShaka();

        // Restaurer position
        video.currentTime = currentTime;
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
        // Ouvrir le sélecteur de fichier
        fileInput.value?.click();
        return;
    }

    if (selected === '-1') {
        // Désactiver les sous-titres
        player.setTextTrackVisibility(false);
        return;
    }

    // Charger les sous-titres depuis Jellyfin
    const subIndex = parseInt(selected);
    const subtitle = subtitleList.value.find(s => s.index === subIndex);

    if (!subtitle) return;

    try {
        // Construire l'URL VTT (Jellyfin convertit automatiquement)
        const vttUrl = `${serverUrl}/Videos/${itemId}/${mediaSource.value?.Id || itemId}/Subtitles/${subIndex}/0/Stream.vtt?api_key=${accessToken}`;

        console.log('Loading subtitle:', vttUrl);

        // Ajouter la piste de sous-titres externe à Shaka
        await player.addTextTrackAsync(
            vttUrl,
            subtitle.language || 'und',
            'subtitles',
            'text/vtt',
            subtitle.codec,
            subtitle.label
        );

        // Activer les sous-titres
        player.setTextTrackVisibility(true);

        // Sélectionner la piste qu'on vient d'ajouter
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

        // Langue depuis le nom de fichier
        const m = name.match(/\.(fr|eng|en|spa|es|de|it|pt|jp|ja|zh|ru)\./i);
        const lang = m ? m[1].toLowerCase() : 'und';

        // Ajouter à Shaka
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
});

onBeforeUnmount(() => {
    if (player) {
        player.destroy().catch(() => { });
        player = null;
    }
});
</script>

<style scoped>
.player-page {
    min-height: 100vh;
    background: #121212;
    color: #e0e0e0;
    padding: 16px;
    display: flex;
    flex-direction: column;
}

.player-header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
}

.title {
    margin: 0;
    justify-self: center;
    font-size: 1.6rem;
    font-weight: 600;
}

.state.error {
    color: #ff6b6b;
    padding: 10px 0;
    text-align: center;
}

.video-container {
    position: relative;
    width: min(100%, 1100px);
    justify-self: center;
}

.player {
    width: 100%;
    height: auto;
    aspect-ratio: 16/9;
    background: #000;
    border-radius: 12px;
    border: 1px solid #232323;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.35);
}

.tracks-controls {
    display: flex;
    gap: 16px;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 10px;
}

.control {
    display: flex;
    align-items: center;
    gap: 8px;
}

select {
    background: #1e1e1e;
    color: #e0e0e0;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    padding: 6px 10px;
}

.btn {
    height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: transform .15s ease, background .2s ease;
    border: 1px solid #2a2a2a;
    color: #e0e0e0;
    background: transparent;
}

.btn:hover {
    background: #1f1f1f;
    transform: translateY(-1px);
}

.hidden-input {
    display: none;
}
</style>
