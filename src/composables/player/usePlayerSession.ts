import { ref, computed, type Ref } from 'vue';
import { useRoute } from 'vue-router';

import type { MediaItem, MediaVersion, PlaybackPlan, PlaybackReporter, PlaybackRequest, PlayMethod } from '@/domain';
import { QUALITY_PRESETS } from '@/constants';
import { usePreferencesStore } from '@/store/preferences-store';
import { useSessionStore } from '@/store/session-store';
import type { AudioTrack, SubtitleTrack } from '@/types/player';
import { deviceCapabilities } from '@/utils/codecDetection';
import { debugLog } from '@/utils/debugLog';
import { languageMatches } from '@/utils/language';
import { logger } from '@/utils/logger';
import { createSubtitleTracks, parseSavedBurnInSubtitleIndex } from '@/utils/subtitleTracks';

/** Play method names the native plugin and the stream info panel use. */
export type PlayMethodName = 'DirectPlay' | 'DirectStream' | 'Transcode';
const PLAY_METHOD_NAME: Record<PlayMethod, PlayMethodName> = {
    'direct-play': 'DirectPlay', 'direct-stream': 'DirectStream', transcode: 'Transcode',
};
const PROGRESS_INTERVAL_MS = 10_000;

/** One negotiation, in the player's terms (seconds, numeric track indexes). */
export interface NegotiateOptions {
    native: boolean;
    startSeconds?: number;
    audioIndex?: number;
    forceTranscode?: boolean;
    transcodeAudio?: boolean;
    stripHevc?: boolean;
    burnInSubtitleIndex?: number;
    /** Never the raw file: the server stream applying the track choices (web audio switch). */
    preferStream?: boolean;
}

/**
 * Shared playback state and server session for the player page.
 *
 * Owns everything the web, native and offline playback paths have in common:
 * the reactive playback state (position, tracks, quality…), negotiation through
 * the backend's playback port, and session reporting.
 * Track indexes are the numeric form of domain stream ids (numeric on every server).
 */
export function usePlayerSession(videoEl: Ref<HTMLVideoElement | null>) {
    const route = useRoute();
    const session = useSessionStore();
    const preferencesStore = usePreferencesStore();
    const backend = session.backend;

    const itemId = route.params.id as string;
    const nextEpisodeId = (route.query.nextEpisodeId as string | undefined) || '';

    // ── Playback state ─────────────────────────────────────────────────────────

    const isLoading = ref(true);
    const isPlaying = ref(false);
    const currentTime = ref(0);
    const duration = ref(0);
    const progressPct = ref(0);
    const error = ref<string | null>(null);
    const mediaTitle = ref('');
    /** The item being played (title, artwork); set by the page once loaded. */
    const item = ref<MediaItem | null>(null);

    const plan = ref<PlaybackPlan | null>(null);
    const version = ref<MediaVersion | null>(null);
    const playSessionId = computed(() => plan.value?.sessionId ?? '');
    const hlsUrl = ref('');
    const playMethod = ref<PlayMethodName>('Transcode');
    /** Authorization the native player sends with every request of the stream. */
    const authHeader = computed(() => plan.value?.headers.Authorization ?? backend?.authHeaders().Authorization ?? '');

    const audioList = ref<AudioTrack[]>([]);
    const selectedAudioIndex = ref<number | null>(null);
    const subtitleList = ref<SubtitleTrack[]>([]);
    const selectedSubtitleIndex = ref<number | null>(null); // null = off
    // Stream index of the image subtitle currently burned into the transcoded
    // video (null = none). Owned here so the native path can restart playback.
    const activeBurnInSubtitleIndex = ref<number | null>(null);

    const selectedBitrate = ref(preferencesStore.preferredBitrate); // 0 = Auto (unlimited)

    // For HLS transcode streams the native position is stream-relative; this
    // offset converts it back to an absolute media position.
    const nativeResumeOffsetMs = ref(0);

    // Cross-path flags shared by the web/native/offline playback composables
    const isSwitching = ref(false);
    const isOfflinePlayback = ref(false);
    const restartInProgress = ref(false);

    const videoStream = computed(() => version.value?.video[0]);
    const activeAudioStream = computed(() => {
        const audio = version.value?.audio ?? [];
        return audio.find((s) => Number(s.id) === selectedAudioIndex.value) ?? audio[0];
    });

    // Only show presets that make sense for the source resolution
    const availablePresets = computed(() => {
        const sourceHeight = videoStream.value?.height ?? 0;
        if (!sourceHeight) return QUALITY_PRESETS;
        return QUALITY_PRESETS.filter(p => p.minHeight === 0 || p.minHeight <= sourceHeight);
    });
    const currentQualityLabel = computed(() =>
        QUALITY_PRESETS.find(p => p.bitrate === selectedBitrate.value)?.label ?? 'Auto'
    );

    const posterUrl = computed(() => {
        const images = item.value?.images;
        return images && backend ? backend.imageUrl(images.thumb ?? images.poster ?? '') : '';
    });

    // ── Reporting ──────────────────────────────────────────────────────────────

    let reporter: PlaybackReporter | null = null;
    let progressInterval: ReturnType<typeof setInterval> | null = null;

    function progressNow() {
        const video = videoEl.value;
        // On the native path videoEl is absent: use the currentTime ref. Before a
        // resume seek lands, video.currentTime is still 0 while the ref holds the
        // resume point, so a real video position wins only when it is set.
        const positionSec = (video?.currentTime && video.currentTime > 0) ? video.currentTime : (currentTime.value || 0);
        return {
            positionMs: Math.floor(positionSec * 1000),
            isPaused: !isPlaying.value,
            audioStreamId: selectedAudioIndex.value === null ? undefined : String(selectedAudioIndex.value),
            isMuted: video?.muted ?? false,
            volume: Math.floor((video?.volume ?? 1) * 100),
        };
    }

    const report = (what: string, call: (r: PlaybackReporter) => Promise<void>) =>
        (reporter ? call(reporter) : Promise.resolve()).catch((e) => logger.error(`${what} error`, e));

    const reportPlaybackStart = () => report('reportPlaybackStart', (r) => r.start({ ...progressNow(), isPaused: false }));
    const reportPlaybackProgress = () => report('reportPlaybackProgress', (r) => r.progress(progressNow()));
    const reportPlaybackStopped = () => report('reportPlaybackStopped', (r) => r.stop(progressNow()));

    /** Kills the server transcode of the current plan (track switch, quality change, exit). */
    async function deleteActiveEncodings() {
        try {
            await reporter?.release();
        } catch (e) {
            logger.warn('[deleteActiveEncodings] error:', e);
        }
    }

    function startProgressReporting() {
        if (progressInterval) clearInterval(progressInterval);
        reportPlaybackStart();
        progressInterval = setInterval(reportPlaybackProgress, PROGRESS_INTERVAL_MS);
    }

    function stopProgressReporting() {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
            reportPlaybackStopped();
        }
    }

    // ── Negotiation ────────────────────────────────────────────────────────────

    async function negotiate(options: NegotiateOptions): Promise<PlaybackPlan> {
        if (!backend) throw new Error('No signed-in server');
        const startMs = options.startSeconds && options.startSeconds > 0 ? Math.floor(options.startSeconds * 1000) : undefined;
        const request: PlaybackRequest = {
            itemId,
            startMs,
            audioStreamId: options.audioIndex === undefined ? undefined : String(options.audioIndex),
            subtitle: options.burnInSubtitleIndex === undefined ? null : { streamId: String(options.burnInSubtitleIndex), mode: 'burn-in' },
            maxBitrate: selectedBitrate.value || undefined,
            device: options.native ? await deviceCapabilities() : undefined,
            constraints: {
                allowDirectPlay: !options.forceTranscode,
                allowAudioCopy: !options.transcodeAudio,
                excludeVideoCodecs: options.stripHevc ? ['hevc'] : [],
            },
            preferStream: options.preferStream,
            target: options.native ? 'native' : 'web',
        };
        debugLog(`[Playback] negotiate ${JSON.stringify({ ...request, device: request.device ? 'native' : undefined })}`);
        const result = await backend.playback.negotiate(request);
        debugLog(`[Playback] plan method=${result.method} startOffsetMs=${result.startOffsetMs} url=${result.url}`);
        return result;
    }

    /** Makes a negotiated plan current: stream URL, method, reporting session. */
    function applyPlan(next: PlaybackPlan) {
        plan.value = next;
        version.value = next.version;
        reporter = backend ? backend.playback.reporter(next, itemId) : null;
        playMethod.value = PLAY_METHOD_NAME[next.method];
        hlsUrl.value = next.url;
    }

    function audioLabel(language: string, channelLayout?: string, channels?: number, codec?: string): string {
        const layout = channelLayout ? `(${channelLayout})` : channels ? `(${channels}ch)` : '';
        return `${language.toUpperCase()} ${layout} ${codec ? `- ${codec.toUpperCase()}` : ''}`.trim();
    }

    function parseAudioStreams(source: MediaVersion, preferredIndex?: number) {
        audioList.value = source.audio.map((s) => ({
            index: Number(s.id),
            language: s.language || 'und',
            label: audioLabel(s.language || 'und', s.channelLayout, s.channels, s.codec),
        }));

        if (preferredIndex !== undefined) {
            selectedAudioIndex.value = preferredIndex;
            return;
        }
        const globalLang = preferencesStore.preferredAudioLanguage;
        const preferred = (globalLang ? source.audio.find((s) => languageMatches(globalLang, s.language || '')) : undefined)
            ?? source.audio.find((s) => s.isDefault)
            ?? source.audio[0];
        selectedAudioIndex.value = preferred ? Number(preferred.id) : 0;
    }

    function parseSubtitleStreams(source: MediaVersion, external = plan.value?.externalSubtitles ?? []) {
        subtitleList.value = createSubtitleTracks(source, external);

        // Per-item saved choice (null = never set) → global language preference → off
        // Stored value: 'off' = explicitly off, numeric string = exact stream index
        const savedVal = localStorage.getItem(`msplayer-subtitle-${itemId}`);
        const globalSubLang = preferencesStore.preferredSubtitleLanguage;
        let preferred: SubtitleTrack | null = null;
        if (savedVal !== null) {
            if (savedVal !== 'off') {
                const savedIdx = parseSavedBurnInSubtitleIndex(savedVal) ?? Number.parseInt(savedVal, 10);
                preferred = !isNaN(savedIdx) ? subtitleList.value.find(s => s.index === savedIdx) ?? null : null;
            }
        } else if (globalSubLang) {
            preferred = subtitleList.value.find(s => languageMatches(globalSubLang, s.language)) ?? null;
        }
        selectedSubtitleIndex.value = preferred?.index ?? null;
    }

    async function fetchNextEpisodeForItem(episodeId: string): Promise<string> {
        if (!backend) return '';
        try {
            const current = await backend.catalog.item(episodeId);
            if (current.kind !== 'episode' || !current.seasonId) return '';
            const episodes = await backend.catalog.episodes(current.seasonId);
            const sorted = [...episodes].sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
            const index = sorted.findIndex((e) => e.id === episodeId);
            return index >= 0 ? sorted[index + 1]?.id ?? '' : '';
        } catch {
            return '';
        }
    }

    return {
        backend,
        itemId,
        nextEpisodeId,
        authHeader,
        isLoading,
        isPlaying,
        currentTime,
        duration,
        progressPct,
        error,
        mediaTitle,
        item,
        plan,
        playSessionId,
        version,
        hlsUrl,
        playMethod,
        audioList,
        selectedAudioIndex,
        subtitleList,
        selectedSubtitleIndex,
        activeBurnInSubtitleIndex,
        selectedBitrate,
        availablePresets,
        currentQualityLabel,
        nativeResumeOffsetMs,
        isSwitching,
        isOfflinePlayback,
        restartInProgress,
        videoStream,
        activeAudioStream,
        posterUrl,
        reportPlaybackStart,
        reportPlaybackProgress,
        reportPlaybackStopped,
        deleteActiveEncodings,
        startProgressReporting,
        stopProgressReporting,
        negotiate,
        applyPlan,
        parseAudioStreams,
        parseSubtitleStreams,
        fetchNextEpisodeForItem,
    };
}

export type PlayerSession = ReturnType<typeof usePlayerSession>;
