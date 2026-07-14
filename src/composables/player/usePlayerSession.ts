import { ref, computed, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { deviceProfile, nativeAndroidDeviceProfile } from '@/constants';
import { debugLog } from '@/utils/debugLog';
import { logger } from '@/utils/logger';
import { buildPlaybackUrl } from '@/utils/playbackUrl';
import { createSubtitleTracks } from '@/utils/subtitleTracks';
import type { MediaSource, MediaStream, SubtitleTrack, AudioTrack, QualityPreset } from '@/types/jellyfin';

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

const ALL_QUALITY_PRESETS: QualityPreset[] = [
    { label: 'Auto',   bitrate: 0,          minHeight: 0    },
    { label: '4K',     bitrate: 80_000_000, minHeight: 2160 },
    { label: '1080p',  bitrate: 20_000_000, minHeight: 1080 },
    { label: '720p',   bitrate:  8_000_000, minHeight: 720  },
    { label: '480p',   bitrate:  3_000_000, minHeight: 480  },
    { label: '360p',   bitrate:  1_500_000, minHeight: 360  },
];

/**
 * Shared playback state and Jellyfin session API for the player page.
 *
 * Owns everything the web, native and offline playback paths have in common:
 * the reactive playback state (position, tracks, quality…), session reporting
 * (Sessions/Playing/*), PlaybackInfo negotiation and stream parsing.
 */
export function usePlayerSession(videoEl: Ref<HTMLVideoElement | null>, isNative: boolean) {
    const route = useRoute();
    const store = useJellyfinStore();
    const preferencesStore = usePreferencesStore();

    const itemId = route.params.id as string;
    const nextEpisodeId = (route.query.nextEpisodeId as string | undefined) || '';
    const accessToken = store.accessToken || '';
    const serverUrl = store.serverUrl;

    const deviceId = getDeviceId();
    const embyAuthHeader = `MediaBrowser Client="MediaServerClient", Device="Browser", DeviceId="${deviceId}", Version="1.0.0", Token="${accessToken}"`;
    const reportingHeaders = { 'Content-Type': 'application/json', 'Authorization': embyAuthHeader };

    // ── Playback state ─────────────────────────────────────────────────────────

    const isLoading = ref(true);
    const isPlaying = ref(false);
    const currentTime = ref(0);
    const duration = ref(0);
    const progressPct = ref(0);
    const error = ref<string | null>(null);
    const mediaTitle = ref('');

    // Jellyfin session
    const playSessionId = ref('');
    const mediaSource = ref<MediaSource | null>(null);
    const hlsUrl = ref('');
    const playMethod = ref<'DirectPlay' | 'DirectStream' | 'Transcode'>('Transcode');

    // Audio tracks
    const audioList = ref<AudioTrack[]>([]);
    const selectedAudioIndex = ref<number | null>(null);

    // Subtitle tracks
    const subtitleList = ref<SubtitleTrack[]>([]);
    const selectedSubtitleIndex = ref<number | null>(null); // null = off
    // Jellyfin stream index of the PGS/image subtitle currently burned into the
    // transcoded video (null = none). Owned here so the native path can restart
    // playback with a new SubtitleStreamIndex.
    const activeBurnInSubtitleIndex = ref<number | null>(null);

    // Quality / bitrate
    const selectedBitrate = ref(preferencesStore.preferredBitrate); // 0 = Auto (unlimited)

    // For HLS transcode streams the native position is stream-relative; this
    // offset converts it back to an absolute media position.
    const nativeResumeOffsetMs = ref(0);

    // Cross-path flags shared by the web/native/offline playback composables
    const isSwitching = ref(false);
    const isOfflinePlayback = ref(false);
    const restartInProgress = ref(false);

    const videoStream = computed((): MediaStream | undefined =>
        mediaSource.value?.MediaStreams?.find((s) => s.Type === 'Video')
    );
    const activeAudioStream = computed(() =>
        (mediaSource.value?.MediaStreams ?? []).find((s: any) => s.Type === 'Audio' && s.Index === selectedAudioIndex.value)
        ?? (mediaSource.value?.MediaStreams ?? []).find((s: any) => s.Type === 'Audio')
    );

    // Only show presets that make sense for the source resolution
    const availablePresets = computed(() => {
        const sourceHeight = videoStream.value?.Height ?? 0;
        if (!sourceHeight) return ALL_QUALITY_PRESETS;
        return ALL_QUALITY_PRESETS.filter(p => p.minHeight === 0 || p.minHeight <= sourceHeight);
    });
    const currentQualityLabel = computed(() =>
        ALL_QUALITY_PRESETS.find(p => p.bitrate === selectedBitrate.value)?.label ?? 'Auto'
    );

    const posterUrl = computed(() => store.getImageUrl(itemId, 'Primary') || '');

    // ── Jellyfin reporting ─────────────────────────────────────────────────────

    let progressInterval: ReturnType<typeof setInterval> | null = null;

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
        } catch (e) { logger.error('reportPlaybackStart error', e); }
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
        } catch (e) { logger.error('reportPlaybackProgress error', e); }
    }

    async function reportPlaybackStopped() {
        try {
            await fetch(`${serverUrl}/Sessions/Playing/Stopped`, {
                method: 'POST',
                headers: reportingHeaders,
                body: JSON.stringify(buildReportingPayload()),
                keepalive: true,
            });
        } catch (e) { logger.error('reportPlaybackStopped error', e); }
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
        } catch (e) { logger.warn('[deleteActiveEncodings] error:', e); }
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

    // ── Jellyfin API ───────────────────────────────────────────────────────────

    async function fetchPlaybackInfo(startTimeTicks?: number, audioStreamIndex?: number, forceTranscode = false, useNativeProfile = false, transcodeAudio = false, stripHevc = false, subtitleStreamIndex?: number) {
        const bitrateCap = selectedBitrate.value || 1_000_000_000;
        // When a quality cap is active we must force a real video re-encode.
        // Stripping DirectPlayProfiles prevents DirectPlay, but Jellyfin can still
        // fall back to DirectStream (remux without re-encoding), which ignores the
        // bitrate cap completely. AllowVideoStreamCopy: false tells Jellyfin it MUST
        // re-encode the video, so the bitrate/resolution cap is actually honoured.
        const shouldForce = forceTranscode || selectedBitrate.value > 0;

        const baseDeviceProfile = useNativeProfile ? nativeAndroidDeviceProfile : deviceProfile;
        const stripDirectPlay = shouldForce || transcodeAudio;

        // When stripHevc is set (video fallback after HEVC decode failure), remove
        // hevc/h265 from TranscodingProfiles so Jellyfin transcodes to H.264 instead
        // of picking HEVC again (which would fail in the same way).
        const removeHevcCodec = (csv: string) => csv.split(',').filter(c => c !== 'hevc' && c !== 'h265').join(',');
        const patchedDeviceProfile = stripHevc
            ? {
                ...baseDeviceProfile.DeviceProfile,
                TranscodingProfiles: (baseDeviceProfile.DeviceProfile.TranscodingProfiles || []).map((tp: any) =>
                    tp.VideoCodec ? { ...tp, VideoCodec: removeHevcCodec(tp.VideoCodec) } : tp
                ),
            }
            : baseDeviceProfile.DeviceProfile;

        const baseProfile = stripDirectPlay
            ? { ...patchedDeviceProfile, DirectPlayProfiles: [], MaxStreamingBitrate: bitrateCap }
            : patchedDeviceProfile;

        // AllowVideoStreamCopy: false forces a real re-encode so the bitrate cap
        // is honoured. BUT Jellyfin has a bug where it drops StartTimeTicks from the
        // TranscodingUrl when AllowVideoStreamCopy=false. So when we have a resume
        // position, skip the flag — MaxStreamingBitrate + stripped DirectPlayProfiles
        // still force transcoding, and StartTimeTicks is preserved.
        const blockVideoCopy = shouldForce && !startTimeTicks;

        const profile: any = {
            ...baseDeviceProfile,
            MaxStreamingBitrate: bitrateCap,
            ...(blockVideoCopy ? { AllowVideoStreamCopy: false } : {}),
            // transcodeAudio: keep video copy (DirectStream) but force Jellyfin to re-encode audio
            // (used when the device can't decode a specific audio format like E-AC3+Atmos)
            ...(transcodeAudio ? { AllowAudioStreamCopy: false } : {}),
            DeviceProfile: baseProfile,
            MediaSourceId: itemId,
            ...(startTimeTicks !== undefined ? { StartTimeTicks: startTimeTicks } : {}),
            ...(audioStreamIndex !== undefined ? { AudioStreamIndex: audioStreamIndex } : {}),
            // Burn-in for PGS/image subtitles: Jellyfin re-encodes the video with the
            // subtitle rendered in when a SubtitleStreamIndex with Encode delivery is set.
            ...(subtitleStreamIndex !== undefined ? { SubtitleStreamIndex: subtitleStreamIndex } : {}),
        };

        debugLog(`[AudioCrash] fetchPlaybackInfo: forceTranscode=${forceTranscode} transcodeAudio=${transcodeAudio} shouldForce=${shouldForce} stripDirectPlay=${stripDirectPlay} stripHevc=${stripHevc} audioStreamIndex=${audioStreamIndex} subtitleStreamIndex=${subtitleStreamIndex ?? 'off'}`);
        debugLog(`[AudioCrash]   DirectPlayProfiles count=${baseProfile.DirectPlayProfiles?.length ?? 'N/A'} AllowAudioStreamCopy=${transcodeAudio ? false : 'unset'} AllowVideoStreamCopy=${shouldForce ? false : 'unset'}`);

        // Pass StartTimeTicks as both a query parameter and in the body.
        // Some Jellyfin versions ignore it in the body when AllowVideoStreamCopy=false,
        // but honour it from the query string.
        const pbQuery = new URLSearchParams({ userId: store.userId! });
        if (startTimeTicks !== undefined) pbQuery.set('StartTimeTicks', String(startTimeTicks));
        const response = await fetch(
            `${serverUrl}/Items/${itemId}/PlaybackInfo?${pbQuery}`,
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
            debugLog(`[NativePlayer] PlaybackInfo response: SupportsDirectPlay=${ms0.SupportsDirectPlay} SupportsDirectStream=${ms0.SupportsDirectStream} TranscodingUrl=${ms0.TranscodingUrl ? 'YES' : 'NO'}`);
            if (ms0.TranscodingUrl) {
                const hasStartTicks = ms0.TranscodingUrl.includes('StartTimeTicks');
                debugLog(`[NativePlayer] TranscodingUrl hasStartTimeTicks=${hasStartTicks}: ${ms0.TranscodingUrl}`);
            }
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
        const msId = ms.Id || itemId;
        const tracks = createSubtitleTracks({
            streams: ms.MediaStreams || [],
            serverUrl,
            itemId,
            mediaSourceId: msId,
        });
        // The native player can burn image subtitles (PGS) into the video server-side,
        // so it keeps every track. The web player can only render external text sidecars.
        subtitleList.value = isNative
            ? tracks
            : tracks.filter((track) => track.playbackMode === 'external');

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

    function determinePlaybackMethod(ms: any) {
        const { method, url } = buildPlaybackUrl(ms, {
            serverUrl, itemId, accessToken, isNative, playSessionId: playSessionId.value,
        });
        playMethod.value = method;
        hlsUrl.value = url;
        debugLog(`[NativePlayer] determinePlaybackMethod: ${playMethod.value}`);
        debugLog(`[NativePlayer] TranscodingUrl from Jellyfin: ${ms.TranscodingUrl ? 'YES' : 'NO'}`);
    }

    async function fetchNextEpisodeForItem(epItemId: string): Promise<string> {
        try {
            const item = await store.fetchItemDetails(epItemId);
            if (item.Type !== 'Episode' || !item.SeasonId) return '';
            const episodes = await store.fetchEpisodes(item.SeasonId);
            const sorted = [...episodes].sort((a: any, b: any) => (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0));
            const idx = sorted.findIndex((e: any) => e.Id === epItemId);
            if (idx < 0 || idx >= sorted.length - 1) return '';
            return (sorted[idx + 1] as any).Id ?? '';
        } catch {
            return '';
        }
    }

    return {
        // Identity / auth
        itemId,
        nextEpisodeId,
        accessToken,
        serverUrl,
        deviceId,
        embyAuthHeader,
        // Playback state
        isLoading,
        isPlaying,
        currentTime,
        duration,
        progressPct,
        error,
        mediaTitle,
        playSessionId,
        mediaSource,
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
        // Reporting
        reportPlaybackStart,
        reportPlaybackProgress,
        reportPlaybackStopped,
        deleteActiveEncodings,
        startProgressReporting,
        stopProgressReporting,
        // Jellyfin API
        fetchPlaybackInfo,
        parseAudioStreams,
        parseSubtitleStreams,
        determinePlaybackMethod,
        fetchNextEpisodeForItem,
    };
}

export type PlayerSession = ReturnType<typeof usePlayerSession>;
