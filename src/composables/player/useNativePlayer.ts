import { useRouter } from 'vue-router';
import { usePreferencesStore } from '@/store/preferences-store';
import { NativeVideo } from '@/plugins/NativeVideoPlugin';
import { debugLog } from '@/utils/debugLog';
import { logger } from '@/utils/logger';
import { languageMatches } from '@/utils/language';
import {
    canHardwareDecodeVideo,
    getDeviceCapabilities,
    getVideoMime,
    isAudioStreamSupported,
} from '@/utils/codecDetection';
import type { PlayerSession } from './usePlayerSession';
import type { StreamInfo } from './useStreamInfo';
import type { SkipIntro } from './useSkipIntro';
import type { MediaStream } from '@/types/jellyfin';

/**
 * Native (Android ExoPlayer) playback path: negotiates the stream with the
 * native device profile, wires all NativeVideo plugin listeners, and handles
 * audio-crash / video-decode fallbacks plus native quality switching.
 */
export function useNativePlayer(
    session: PlayerSession,
    streamInfo: StreamInfo,
    skipIntro: SkipIntro,
) {
    const {
        itemId, nextEpisodeId, embyAuthHeader,
        isLoading, currentTime, duration, progressPct, error,
        playSessionId, mediaSource, hlsUrl, playMethod,
        audioList, selectedAudioIndex, subtitleList, selectedSubtitleIndex,
        activeBurnInSubtitleIndex,
        selectedBitrate, availablePresets, nativeResumeOffsetMs,
        isSwitching, restartInProgress,
        reportPlaybackStart, reportPlaybackProgress, reportPlaybackStopped,
        deleteActiveEncodings, fetchPlaybackInfo,
        parseAudioStreams, parseSubtitleStreams, determinePlaybackMethod,
        fetchNextEpisodeForItem,
    } = session;

    const router = useRouter();
    const preferencesStore = usePreferencesStore();

    let nativeSwitchingQuality = false; // suppress 'stopped' → router.back() during native quality switch

    // Remember the transcode context of the current native session so restarts
    // (audio crash, quality switch, subtitle burn-in) preserve it instead of
    // silently reverting to DirectPlay.
    let activeNativeTranscodeAudio = false;
    let activeNativeForceTranscodeVideo = false;
    let activeNativeStripHevc = false;
    let activeNativeChapters: Array<{ name: string; startMs: number }> | undefined;

    async function restartWithAudio(resumeSeconds: number, jellyfinAudioIndex: number | undefined, title?: string) {
        if (restartInProgress.value) {
            debugLog(`[AudioCrash] restartWithAudio: SKIPPED (already in progress)`);
            return;
        }
        restartInProgress.value = true;
        debugLog(`[AudioCrash] restartWithAudio: resumeSeconds=${resumeSeconds} jellyfinAudioIndex=${jellyfinAudioIndex} title="${title}"`);
        nativeSwitchingQuality = true;
        isLoading.value = true;
        try {
            debugLog(`[AudioCrash] restartWithAudio: removing listeners...`);
            await NativeVideo.removeAllListeners();
            debugLog(`[AudioCrash] restartWithAudio: stopping native player...`);
            await NativeVideo.stop();
            debugLog(`[AudioCrash] restartWithAudio: deleting active encodings...`);
            await deleteActiveEncodings();
            debugLog(`[AudioCrash] restartWithAudio: calling initNativePlayer...`);
            await initNativePlayer(resumeSeconds, jellyfinAudioIndex, title, true);
            debugLog(`[AudioCrash] restartWithAudio: initNativePlayer completed successfully`);
        } catch (e) {
            debugLog(`[AudioCrash] restartWithAudio FAILED: ${e}`);
            error.value = 'Failed to switch audio track';
            isLoading.value = false;
        } finally {
            nativeSwitchingQuality = false;
            restartInProgress.value = false;
        }
    }

    // Switch the burned-in image subtitle by restarting playback with a new
    // SubtitleStreamIndex (null = turn burn-in off). The transcode context is
    // preserved through initNativePlayer's sticky defaults.
    async function restartWithBurnInSubtitle(
        resumeSeconds: number,
        subtitleStreamIndex: number | null,
        title: string | undefined,
        targetTextLabel?: string,
    ) {
        if (restartInProgress.value) return;
        restartInProgress.value = true;
        nativeSwitchingQuality = true;
        isLoading.value = true;

        const preferenceKey = `msplayer-subtitle-native-${itemId}`;
        const previousPreference = localStorage.getItem(preferenceKey);
        const previousBurnInIndex = activeBurnInSubtitleIndex.value;
        const nextPreference = subtitleStreamIndex !== null
            ? `burn-in:${subtitleStreamIndex}`
            : targetTextLabel || 'off';

        try {
            localStorage.setItem(preferenceKey, nextPreference);
            activeBurnInSubtitleIndex.value = subtitleStreamIndex;
            selectedSubtitleIndex.value = subtitleStreamIndex;
            await NativeVideo.removeAllListeners();
            await NativeVideo.stop();
            await deleteActiveEncodings();
            await initNativePlayer(resumeSeconds, selectedAudioIndex.value ?? undefined, title);
        } catch (e) {
            activeBurnInSubtitleIndex.value = previousBurnInIndex;
            if (previousPreference === null) localStorage.removeItem(preferenceKey);
            else localStorage.setItem(preferenceKey, previousPreference);
            logger.error('[Subtitles] Failed to restart with burn-in subtitle:', e);
            error.value = 'Failed to switch subtitle track';
            isLoading.value = false;
        } finally {
            nativeSwitchingQuality = false;
            restartInProgress.value = false;
        }
    }

    async function initNativePlayer(
        resumeSeconds?: number,
        preferredAudioIndex?: number,
        title?: string,
        transcodeAudio = activeNativeTranscodeAudio,
        forceTranscodeVideo = activeNativeForceTranscodeVideo,
        chapters = activeNativeChapters,
        stripHevc = activeNativeStripHevc,
        subtitleStreamIndex: number | undefined = activeBurnInSubtitleIndex.value ?? undefined,
    ) {
        isLoading.value = true;
        activeNativeTranscodeAudio = transcodeAudio;
        activeNativeForceTranscodeVideo = forceTranscodeVideo;
        activeNativeChapters = chapters;
        activeNativeStripHevc = stripHevc;

        try {
            const startTicks = resumeSeconds && resumeSeconds > 0
                ? Math.floor(resumeSeconds * 10_000_000)
                : undefined;

            const [data, resolvedNextEpisodeId] = await Promise.all([
                fetchPlaybackInfo(startTicks, preferredAudioIndex, forceTranscodeVideo, true, transcodeAudio, stripHevc, subtitleStreamIndex),
                nextEpisodeId ? Promise.resolve(nextEpisodeId) : fetchNextEpisodeForItem(itemId),
            ]);
            mediaSource.value = data.MediaSources?.[0];
            if (!mediaSource.value) throw new Error('No media source available');

            if (data.PlaySessionId) playSessionId.value = data.PlaySessionId;
            parseAudioStreams(mediaSource.value, preferredAudioIndex);
            parseSubtitleStreams(mediaSource.value);
            activeBurnInSubtitleIndex.value = subtitleStreamIndex ?? null;
            selectedSubtitleIndex.value = subtitleStreamIndex ?? null;
            determinePlaybackMethod(mediaSource.value);

            // Pre-seed currentTime so reportPlaybackStart sends the correct resume position.
            // Without this, PositionTicks:0 is sent and Jellyfin immediately overwrites
            // the stored position — causing startMs=0 on the very next resume attempt.
            if (resumeSeconds && resumeSeconds > 0) currentTime.value = resumeSeconds;

            await reportPlaybackStart();

            const isDirectPlayRaw = playMethod.value === 'DirectPlay' && !hlsUrl.value.includes('.m3u8');

            // When the HLS URL contains StartTimeTicks the stream begins at the
            // resume point and ExoPlayer positions are stream-relative.
            // Otherwise (DirectPlay or no StartTimeTicks) ExoPlayer seeks itself.
            const hlsHasStartTicks = hlsUrl.value.includes('StartTimeTicks');
            const finalStartPositionMs = (isDirectPlayRaw || !hlsHasStartTicks)
                ? (resumeSeconds && resumeSeconds > 0 ? Math.floor(resumeSeconds * 1000) : 0)
                : 0;
            const finalResumeOffsetMs = (isDirectPlayRaw || !hlsHasStartTicks)
                ? 0
                : (resumeSeconds && resumeSeconds > 0 ? Math.floor(resumeSeconds * 1000) : 0);
            nativeResumeOffsetMs.value = finalResumeOffsetMs;

            debugLog(`[NativePlayer] resumeSeconds=${resumeSeconds} startPositionMs=${finalStartPositionMs} resumeOffsetMs=${finalResumeOffsetMs} hlsHasStartTicks=${hlsHasStartTicks} playMethod=${playMethod.value}`);
            debugLog(`[NativePlayer] hlsUrl=${hlsUrl.value}`);

            // Build subtitle tracks for ExoPlayer.
            // For raw DirectPlay, ExoPlayer extracts embedded text tracks from the MKV
            // container directly — passing sidecar VTTs would create duplicates.
            // For HLS (transcode / direct-stream), embedded subs are not in the HLS
            // manifest, so we pass them as external sidecar tracks.
            const subtitleTracks = isDirectPlayRaw
                ? []
                : subtitleList.value
                    .filter(s => s.playbackMode === 'external' && s.deliveryUrl)
                    .map(s => ({
                        url: s.deliveryUrl!,
                        lang: s.language,
                        label: s.label,
                    }));
            // Image subtitles (PGS) can't be rendered by ExoPlayer — offer them as
            // burn-in choices the native picker restarts playback to apply.
            const burnInSubtitleTracks = subtitleList.value
                .filter(s => s.playbackMode === 'burn-in')
                .map(s => ({
                    index: s.index,
                    lang: s.language,
                    label: s.label,
                }));

            // Flag that suppresses localStorage writes in the subtitleSelected listener while
            // we are programmatically restoring a saved preference from tracksReady.
            // Without this, restore calls fire subtitleSelected which overwrites the saved value.
            let restoringSubtitle = false;

            // Track the last known good position so audio error handlers can resume
            // even if the crash happens before a progress event fires.
            let lastGoodPositionSec = resumeSeconds || 0;

            // Register event listeners before starting
            await NativeVideo.addListener('progress', (data) => {
                currentTime.value = (data.positionMs + finalResumeOffsetMs) / 1000;
                lastGoodPositionSec = currentTime.value;
                duration.value = data.durationMs / 1000;
                if (duration.value > 0) progressPct.value = (currentTime.value / duration.value) * 100;
                reportPlaybackProgress();
            });

            await NativeVideo.addListener('stopped', async (data) => {
                currentTime.value = (data.positionMs + finalResumeOffsetMs) / 1000;
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

            // Video decode failure (Dolby Vision or hardware capability exceeded) →
            // restart with server-side transcoding.
            await NativeVideo.addListener('videoError', async (data) => {
                debugLog(`[VideoFallback] videoError: reason=${data.reason} positionMs=${data.positionMs}`);
                if (data.reason === 'dolby_vision_unsupported' || data.reason === 'video_codec_unsupported') {
                    debugLog('[VideoFallback] Restarting with video transcoding (stripHevc=true)...');
                    await NativeVideo.removeAllListeners();
                    const resumeSec = data.positionMs / 1000;
                    // forceTranscodeVideo + stripHevc: forces re-encode and removes HEVC
                    // from TranscodingProfiles so Jellyfin picks H.264 instead
                    await initNativePlayer(resumeSec, selectedAudioIndex.value ?? undefined, title, false, true, undefined, true);
                } else {
                    error.value = `Video error: ${data.reason}`;
                    isLoading.value = false;
                }
            });

            await NativeVideo.addListener('tracksReady', async (data) => {
                isLoading.value = false; // stream is ready — hide spinner now
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
                            (globalLang ? nativeAudio.find((t: any) => languageMatches(globalLang, t.language)) : null);
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
                        const nativeSub = nativeSubtitle.find((t: any) => languageMatches(globalSubLang, t.language));
                        if (nativeSub) {
                            restoringSubtitle = true;
                            NativeVideo.selectSubtitleTrack({ groupIndex: nativeSub.groupIndex });
                            selectedSubtitleIndex.value = nativeSub.groupIndex;
                        }
                        // No match for global lang — leave ExoPlayer default, don't touch localStorage.
                    }
                    // No preference at all — leave ExoPlayer at its default (no subtitles).
                } catch (e) {
                    logger.warn('[NativePlayer] Failed to parse tracksReady:', e);
                }
            });

            await NativeVideo.addListener('audioSelected', (data) => {
                localStorage.setItem(`msplayer-audio-${itemId}`, data.language);
                selectedAudioIndex.value = data.groupIndex;
            });

            await NativeVideo.addListener('subtitleSelected', async (data) => {
                NativeVideo.nativeLog({ message: `[Subtitles] selected groupIndex=${data.groupIndex} label=${data.label} restoringSubtitle=${restoringSubtitle}` });
                // A burnInSubtitleIndex means the native picker toggled an image (PGS)
                // subtitle: restart with the new SubtitleStreamIndex for server-side burn-in.
                if (data.burnInSubtitleIndex !== undefined) {
                    const streamIndex = data.burnInSubtitleIndex >= 0
                        ? data.burnInSubtitleIndex
                        : null;
                    const targetTextLabel = data.groupIndex >= 0 ? data.label : undefined;
                    await restartWithBurnInSubtitle(lastGoodPositionSec, streamIndex, title, targetTextLabel);
                    return;
                }
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
                debugLog(`[AudioCrash] >>> audioError EVENT: groupIndex=${data.groupIndex} language="${data.language}" lastGoodPos=${lastGoodPositionSec} currentTime=${currentTime.value} restartInProgress=${restartInProgress.value}`);
                const savedPosition = lastGoodPositionSec;
                const audioStreams = (mediaSource.value?.MediaStreams ?? []).filter((s: any) => s.Type === 'Audio');
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
                debugLog(`[AudioCrash] >>> audioSwitchJellyfin EVENT: jellyfinIndex=${data.jellyfinIndex} lastGoodPos=${lastGoodPositionSec} currentTime=${currentTime.value} restartInProgress=${restartInProgress.value}`);
                await restartWithAudio(lastGoodPositionSec, data.jellyfinIndex, title);
            });

            await NativeVideo.addListener('debugLog', (data) => {
                debugLog(data.message, 'kotlin');
            });

            await NativeVideo.addListener('nextEpisode', async (data) => {
                if (!data.nextEpisodeId) return;
                await NativeVideo.removeAllListeners();
                router.replace({ name: 'Player', params: { id: data.nextEpisodeId } });
            });

            await NativeVideo.addListener('subtitleSizeChanged', (data) => {
                preferencesStore.subtitleSize = data.scale;
            });

            debugLog(`[NativePlayer] calling NativeVideo.start: startPositionMs=${finalStartPositionMs} playMethod=${playMethod.value} subtitleTracks=${subtitleTracks.length} nextEpisodeId=${resolvedNextEpisodeId}`);
            await NativeVideo.start({
                url: hlsUrl.value,
                authHeader: embyAuthHeader,
                startPositionMs: finalStartPositionMs,
                title: title || (mediaSource.value as any)?.Name || '',
                playMethod: playMethod.value,
                subtitleTracks,
                burnInSubtitleTracks,
                selectedBurnInSubtitleIndex: subtitleStreamIndex,
                qualityPresets: JSON.stringify(availablePresets.value.map(p => ({ bitrate: p.bitrate, label: p.label }))),
                selectedBitrate: selectedBitrate.value,
                streamInfo: streamInfo.buildStreamInfoJson(),
                audioTracksJson: JSON.stringify(audioList.value.map(a => ({
                    index: a.index,
                    label: a.label,
                    language: a.language,
                }))),
                selectedAudioIndex: selectedAudioIndex.value ?? -1,
                subtitleTextSize: preferencesStore.subtitleSize,
                nextEpisodeId: resolvedNextEpisodeId,
                chaptersJson: chapters?.length ? JSON.stringify(chapters) : undefined,
                creditsStartMs: skipIntro.creditsStartMs.value,
            });

            // Don't clear isLoading here — keep the spinner until tracksReady fires,
            // so fallback restarts (e.g. codec unsupported → transcode) remain invisible.
        } catch (e: any) {
            logger.error('[initNativePlayer] error:', e);
            error.value = 'Failed to initialize native player';
            isLoading.value = false;
        }
    }

    async function switchQualityNative(bitrate: number) {
        if (bitrate === selectedBitrate.value || isSwitching.value) return;
        isSwitching.value = true;
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
            await streamInfo.fetchTranscodingInfo();
            await NativeVideo.updateStreamInfo({ streamInfo: streamInfo.buildStreamInfoJson() });
            await NativeVideo.updateQualityPresets({
                presets: JSON.stringify(availablePresets.value.map(p => ({ bitrate: p.bitrate, label: p.label }))),
                selectedBitrate: selectedBitrate.value,
            });
        } catch (e: any) {
            logger.error('[switchQualityNative] error:', e);
            selectedBitrate.value = previousBitrate;
            error.value = 'Failed to switch quality';
            isLoading.value = false;
        } finally {
            nativeSwitchingQuality = false;
            isSwitching.value = false;
        }
    }

    /**
     * Probe this device's real MediaCodec/FFmpeg capabilities before asking
     * Jellyfin for a stream. Video DirectPlay requires a matching hardware
     * decoder profile, level, size, and frame rate. Audio can use MediaCodec or
     * FFmpeg, except AAC (MediaCodec only) and E-AC3 JOC (explicit platform
     * support required).
     */
    async function detectCodecFallbacks(
        allStreams: MediaStream[],
        preferredAudio?: MediaStream,
    ): Promise<{ forceTranscodeAudio: boolean; forceTranscodeVideo: boolean; stripHevc: boolean }> {
        let forceTranscodeAudio = false;
        let forceTranscodeVideo = false;
        let stripHevc = false;

        const capabilities = await getDeviceCapabilities();
        if (capabilities.androidApi <= 0) {
            debugLog('[Codec] Device capability probe unavailable; preserving runtime fallback');
            return { forceTranscodeAudio, forceTranscodeVideo, stripHevc };
        }

        debugLog(
            `[Codec] ${capabilities.manufacturer} ${capabilities.model} API ${capabilities.androidApi} ` +
            `display=${capabilities.displayWidth}x${capabilities.displayHeight} ` +
            `video=[${capabilities.hardwareVideoCodecs.join(',')}] ` +
            `audio=[${capabilities.platformAudioCodecs.join(',')}]`,
        );

        if (preferredAudio && !isAudioStreamSupported(preferredAudio, capabilities)) {
            debugLog(
                `[Codec] Audio codec "${preferredAudio.Codec}" profile="${preferredAudio.Profile || ''}" ` +
                'is unsupported by this device; requesting AAC transcode',
            );
            forceTranscodeAudio = true;
        }

        const videoStream = allStreams.find(stream => stream.Type === 'Video');
        if (videoStream) {
            const result = await canHardwareDecodeVideo(videoStream);
            if (!result.supported) {
                const mime = getVideoMime(videoStream);
                debugLog(
                    `[Codec] Video codec "${videoStream.Codec}" profile="${videoStream.Profile || ''}" ` +
                    `level=${videoStream.Level || 0} ${videoStream.Width || 0}x${videoStream.Height || 0} ` +
                    `unsupported: ${result.reason}; requesting H.264 transcode`,
                );
                forceTranscodeVideo = true;
                stripHevc = mime === 'video/hevc' || mime === 'video/dolby-vision';
            } else {
                debugLog(`[Codec] Hardware decoder selected: ${result.decoderName}`);
            }
        }

        return { forceTranscodeAudio, forceTranscodeVideo, stripHevc };
    }

    return {
        initNativePlayer,
        detectCodecFallbacks,
    };
}

export type NativePlayer = ReturnType<typeof useNativePlayer>;
