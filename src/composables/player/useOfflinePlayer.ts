import { i18n } from '@/i18n';
import { type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { usePlatform } from '@/composables/usePlatform';
import { usePreferencesStore } from '@/store/preferences-store';
import { offlineDatabase, type DownloadedMedia } from '@/services/offlineDatabase';
import { NativeVideo } from '@/plugins/NativeVideoPlugin';
import { debugLog } from '@/utils/debugLog';
import { logger } from '@/utils/logger';
import { languageMatches } from '@/utils/language';
import type { PlayerSession } from './usePlayerSession';
import type { SkipIntro } from './useSkipIntro';

/**
 * Offline playback path: plays a downloaded file with zero network calls.
 * Native uses ExoPlayer on the raw file:// URI; web reads the file from the
 * Capacitor Filesystem into a blob URL. Watch progress is saved locally to
 * IndexedDB and synced back to the server later by the sync service.
 */
export function useOfflinePlayer(
    session: PlayerSession,
    skipIntro: SkipIntro,
    videoEl: Ref<HTMLVideoElement | null>,
    isNative: boolean,
) {
    const {
        itemId, nextEpisodeId,
        isLoading, currentTime, duration, progressPct, error,
        hlsUrl, playMethod,
        audioList, selectedAudioIndex, subtitleList, selectedSubtitleIndex,
        isOfflinePlayback, restartInProgress,
    } = session;

    const router = useRouter();
    const preferencesStore = usePreferencesStore();
    const { isDesktop } = usePlatform();

    let offlineProgressInterval: ReturnType<typeof setInterval> | null = null;

    async function saveOfflineProgress() {
        if (!isOfflinePlayback.value || !duration.value) return;
        const percentage = (currentTime.value / duration.value) * 100;
        const completed = percentage >= 90;
        await offlineDatabase.saveWatchProgress({
            itemId,
            position: currentTime.value,
            duration: duration.value,
            percentage,
            completed,
            lastWatched: Date.now(),
            synced: false,
        });
    }

    async function initOfflinePlayer(cachedDownload: DownloadedMedia, resumeSeconds?: number, itemTitle?: string, skipAudioGroupIndex?: number) {
        isOfflinePlayback.value = true;
        isLoading.value = true;
        try {
            // Native (ExoPlayer): raw file:// URI — ExoPlayer can't access
            // Capacitor's https://localhost/_capacitor_file_/ WebView URLs.
            // Web: read from IndexedDB (Capacitor's web Filesystem backend)
            // and create a blob URL for the <video> element.
            let playUrl: string | null = null;
            if (isNative) {
                if (isPublicAndroidPath(cachedDownload.filePath)) {
                    playUrl = cachedDownload.filePath;
                } else {
                    const fileInfo = await Filesystem.getUri({
                        path: cachedDownload.filePath,
                        directory: Directory.Data,
                    });
                    playUrl = fileInfo.uri;
                }
            } else if (isDesktop && window.desktopRuntime) {
                playUrl = window.desktopRuntime.getMediaUrl(cachedDownload.filePath);
            } else {
                const fileData = await Filesystem.readFile({
                    path: cachedDownload.filePath,
                    directory: Directory.Data,
                });
                const resp = await fetch(`data:video/mp4;base64,${fileData.data}`);
                const blob = await resp.blob();
                playUrl = URL.createObjectURL(blob);
            }

            if (!playUrl) {
                error.value = i18n.global.t('player.errors.fileNotFound');
                isLoading.value = false;
                return;
            }

            hlsUrl.value = playUrl;
            playMethod.value = 'DirectPlay';
            const startPositionMs = resumeSeconds && resumeSeconds > 0 ? Math.floor(resumeSeconds * 1000) : 0;

            // Offline mode: NO network calls — no reportPlaybackStart/Progress/Stopped,
            // no startProgressReporting, no deleteActiveEncodings.
            if (isNative) {
                let nativeProgressCount = 0;
                let lastGoodPositionSec = resumeSeconds || 0;
                let restoringSubtitle = false;

                // Fallback duration from the stored item — transcoded MKV containers
                // may not have accurate duration headers, causing ExoPlayer to report 0.
                const cachedDurationMs = Math.floor(cachedDownload.item.durationMs ?? 0);

                await NativeVideo.addListener('progress', (data) => {
                    currentTime.value = data.positionMs / 1000;
                    const durMs = data.durationMs > 0 ? data.durationMs : cachedDurationMs;
                    duration.value = durMs / 1000;
                    if (duration.value > 0) progressPct.value = (currentTime.value / duration.value) * 100;
                    lastGoodPositionSec = currentTime.value;
                    if (++nativeProgressCount % 10 === 0) saveOfflineProgress();
                });
                await NativeVideo.addListener('stopped', async () => {
                    await saveOfflineProgress();
                    router.back();
                });
                await NativeVideo.addListener('ended', async () => {
                    await saveOfflineProgress();
                    router.back();
                });
                await NativeVideo.addListener('error', (data) => {
                    error.value = data.message;
                    isLoading.value = false;
                });

                // Video format unsupported — offline content can't be transcoded
                await NativeVideo.addListener('videoError', (data) => {
                    debugLog(`[VideoFallback] offline videoError: reason=${data.reason}`);
                    if (data.reason === 'dolby_vision_unsupported') {
                        error.value = i18n.global.t('player.errors.noDolbyVision');
                    } else if (data.reason === 'video_codec_unsupported') {
                        error.value = i18n.global.t('player.errors.unsupportedFormat');
                    } else {
                        error.value = i18n.global.t('player.errors.videoError', { reason: data.reason });
                    }
                    isLoading.value = false;
                });

                // ── Offline track handling ──────────────────────────────────────
                // Populate audio/subtitle pickers from ExoPlayer embedded tracks,
                // apply saved preferences, and handle unsupported codecs.

                await NativeVideo.addListener('tracksReady', async (data) => {
                    isLoading.value = false;
                    try {
                        const parsed = JSON.parse(data.tracks);
                        const nativeAudio: any[] = parsed.audioTracks ?? [];
                        const nativeSubtitle: any[] = parsed.subtitleTracks ?? [];

                        // Enrich ExoPlayer track info with the stored item's streams —
                        // transcoded MKV containers may lack proper language tags.
                        const storedVersion = 'versions' in cachedDownload.item ? cachedDownload.item.versions[0] : undefined;
                        const jfAudioStreams = storedVersion?.audio ?? [];
                        const jfSubStreams = storedVersion?.subtitles ?? [];

                        // Populate audio list from embedded tracks (always DirectPlay offline)
                        if (nativeAudio.length > 0) {
                            audioList.value = nativeAudio.map((t: any, i: number) => {
                                const jf = jfAudioStreams[i];
                                const lang = t.language && t.language !== 'und' ? t.language : (jf?.language || 'und');
                                const label = jf?.title
                                  || `${lang.toUpperCase()} ${t.channelCount > 0 ? `(${t.channelCount}ch)` : ''} ${t.codec ? `- ${t.codec.toUpperCase()}` : ''}`.trim();
                                return { index: t.groupIndex, language: lang, label };
                            });

                            // Apply saved audio preference to ExoPlayer (skip any track that previously crashed)
                            const savedLang = localStorage.getItem(`msplayer-audio-${itemId}`);
                            const globalLang = preferencesStore.preferredAudioLanguage;
                            debugLog(`[Offline] tracksReady: ${nativeAudio.length} audio tracks, savedLang="${savedLang}" globalLang="${globalLang}"`);
                            audioList.value.forEach((t: any) => debugLog(`[Offline]   track: groupIndex=${t.index} lang="${t.language}" label="${t.label}"`));

                            const preferredAudio =
                                (savedLang ? audioList.value.find((t: any) => t.language === savedLang && t.index !== skipAudioGroupIndex) : null) ||
                                (globalLang ? audioList.value.find((t: any) => languageMatches(globalLang, t.language) && t.index !== skipAudioGroupIndex) : null);
                            if (preferredAudio) {
                                debugLog(`[Offline] tracksReady: auto-switching to groupIndex=${preferredAudio.index} lang="${preferredAudio.language}"`);
                                NativeVideo.selectAudioTrack({ groupIndex: preferredAudio.index });
                                selectedAudioIndex.value = preferredAudio.index;
                            } else {
                                debugLog(`[Offline] tracksReady: no preference match, keeping default`);
                            }
                        }

                        // Enrich subtitle labels with Jellyfin metadata
                        const enrichedSubs = nativeSubtitle.map((t: any, i: number) => {
                            const jf = jfSubStreams[i];
                            const lang = t.language && t.language !== 'und' ? t.language : (jf?.language || 'und');
                            const label = jf?.title || t.label || lang;
                            return { ...t, language: lang, label };
                        });

                        // Apply saved subtitle preference to ExoPlayer
                        const savedNative = localStorage.getItem(`msplayer-subtitle-native-${itemId}`);
                        const globalSubLang = preferencesStore.preferredSubtitleLanguage;
                        if (savedNative === 'off') {
                            // ExoPlayer defaults to no subtitles — nothing needed
                        } else if (savedNative !== null) {
                            const nativeSub = enrichedSubs.find((t: any) => t.label === savedNative);
                            if (nativeSub) {
                                restoringSubtitle = true;
                                NativeVideo.selectSubtitleTrack({ groupIndex: nativeSub.groupIndex });
                                selectedSubtitleIndex.value = nativeSub.groupIndex;
                            }
                        } else if (globalSubLang) {
                            const nativeSub = enrichedSubs.find((t: any) => languageMatches(globalSubLang, t.language));
                            if (nativeSub) {
                                restoringSubtitle = true;
                                NativeVideo.selectSubtitleTrack({ groupIndex: nativeSub.groupIndex });
                                selectedSubtitleIndex.value = nativeSub.groupIndex;
                            }
                        }
                    } catch (e) {
                        logger.warn('[Offline] Failed to parse tracksReady:', e);
                    }
                });

                await NativeVideo.addListener('audioSelected', (data) => {
                    localStorage.setItem(`msplayer-audio-${itemId}`, data.language);
                    selectedAudioIndex.value = data.groupIndex;
                });

                await NativeVideo.addListener('subtitleSelected', (data) => {
                    if (restoringSubtitle) {
                        restoringSubtitle = false;
                        return;
                    }
                    localStorage.setItem(`msplayer-subtitle-native-${itemId}`, data.label);
                    selectedSubtitleIndex.value = data.groupIndex;
                });

                // Offline audio error: FFmpeg decoder should handle most codecs, but as
                // a safety net restart playback skipping the unsupported track.
                await NativeVideo.addListener('audioError', async (data) => {
                    debugLog(`[Offline] audioError: groupIndex=${data.groupIndex} lang="${data.language}" — restarting with fallback track`);
                    if (restartInProgress.value) return;
                    restartInProgress.value = true;
                    try {
                        await NativeVideo.removeAllListeners();
                        await NativeVideo.stop();
                        await initOfflinePlayer(cachedDownload, lastGoodPositionSec || resumeSeconds, itemTitle, data.groupIndex);
                    } catch (e) {
                        debugLog(`[Offline] audioError restart failed: ${e}`);
                        error.value = i18n.global.t('player.errors.audioUnsupported');
                        isLoading.value = false;
                    } finally {
                        restartInProgress.value = false;
                    }
                });

                await NativeVideo.addListener('debugLog', (data) => {
                    debugLog(data.message, 'kotlin');
                });

                // Build sidecar subtitle path for offline SRT rendering (bypasses ExoPlayer MergingMediaSource)
                let offlineSrtPath: string | undefined;
                if (cachedDownload.subtitleFilePath) {
                    try {
                        if (isPublicAndroidPath(cachedDownload.subtitleFilePath)) {
                            offlineSrtPath = cachedDownload.subtitleFilePath;
                        } else {
                            const subUri = await Filesystem.getUri({
                                path: cachedDownload.subtitleFilePath,
                                directory: Directory.Data,
                            });
                            offlineSrtPath = subUri.uri;
                        }
                        debugLog(`[Offline] SRT subtitle: ${offlineSrtPath}`);
                    } catch (e) {
                        debugLog(`[Offline] Subtitle file not found: ${cachedDownload.subtitleFilePath}`);
                    }
                }

                await NativeVideo.start({
                    url: playUrl,
                    authHeader: '',
                    startPositionMs,
                    title: itemTitle || '',
                    playMethod: 'DirectPlay',
                    subtitleTracks: [],
                    subtitleTextSize: preferencesStore.subtitleSize,
                    nextEpisodeId: nextEpisodeId || '',
                    creditsStartMs: skipIntro.creditsStartMs.value,
                    durationHintMs: cachedDurationMs || undefined,
                    srtFilePath: offlineSrtPath,
                });

                // Apply stored intro/credits markers so skip-intro works offline
                const intro = cachedDownload.markers.find((m) => m.kind === 'intro');
                if (intro) {
                    NativeVideo.setIntroTimestamps({
                        introStartMs: Math.floor(intro.startMs),
                        introEndMs: Math.floor(intro.endMs),
                    }).catch(() => {});
                }
                const credits = cachedDownload.markers.find((m) => m.kind === 'credits');
                if (credits) skipIntro.creditsStartMs.value = Math.floor(credits.startMs);
                // isLoading cleared by tracksReady listener above
            } else {
                const video = videoEl.value;
                if (!video) return;

                // Desktop sidecar subtitle (.vtt): expose it as an external track so
                // the web player's <track> pipeline renders it — Chromium exposes no
                // embedded subtitle tracks from the media file itself.
                if (isDesktop && window.desktopRuntime
                    && cachedDownload.subtitleFilePath?.endsWith('.vtt')) {
                    subtitleList.value = [{
                        index: 0,
                        language: cachedDownload.subtitleLanguage || 'und',
                        label: cachedDownload.subtitleLabel || 'Subtitles',
                        playbackMode: 'external',
                        deliveryUrl: window.desktopRuntime.getMediaUrl(cachedDownload.subtitleFilePath),
                    }];

                    // Auto-show: per-item choice wins; otherwise the global language
                    // preference decides. "off" stays off, but the track remains
                    // selectable from the subtitle menu.
                    const saved = localStorage.getItem(`msplayer-subtitle-${itemId}`);
                    const globalSubLang = preferencesStore.preferredSubtitleLanguage;
                    const wantsSubtitles = saved !== null
                        ? saved !== 'off'
                        : Boolean(globalSubLang
                            && languageMatches(globalSubLang, cachedDownload.subtitleLanguage || ''));
                    if (wantsSubtitles) selectedSubtitleIndex.value = 0;
                }

                video.src = playUrl;
                if (resumeSeconds && resumeSeconds > 0) {
                    const seekOnce = () => {
                        video.removeEventListener('loadedmetadata', seekOnce);
                        video.currentTime = resumeSeconds;
                        video.play().catch(() => {});
                    };
                    video.addEventListener('loadedmetadata', seekOnce);
                } else {
                    video.play().catch(() => {});
                }
                offlineProgressInterval = setInterval(saveOfflineProgress, 10_000);
                isLoading.value = false;
            }
        } catch (e: any) {
            logger.error('[initOfflinePlayer] error:', e);
            error.value = i18n.global.t('player.errors.playDownloadFailed');
            isLoading.value = false;
        }
    }

    function dispose() {
        if (offlineProgressInterval) { clearInterval(offlineProgressInterval); offlineProgressInterval = null; }
    }

    return {
        saveOfflineProgress,
        initOfflinePlayer,
        dispose,
    };
}

function isPublicAndroidPath(filePath: string): boolean {
    return filePath.startsWith('content://') || filePath.startsWith('file://') || filePath.startsWith('/');
}

export type OfflinePlayer = ReturnType<typeof useOfflinePlayer>;
