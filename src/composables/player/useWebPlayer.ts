import { i18n } from '@/i18n';
import { isAudioRevertNotice } from '@/utils/playerNotices';
import { ref, watch, nextTick, type Ref } from 'vue';
import Hls from 'hls.js';
import { usePreferencesStore } from '@/store/preferences-store';
import { NativeVideo } from '@/plugins/NativeVideoPlugin';
import { logger } from '@/utils/logger';
import { srtToVtt } from '@/utils/srtToVtt';
import type { PlayerSession } from './usePlayerSession';
import type { PlayerControls } from './usePlayerControls';

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

/**
 * Web (dev-server preview) playback path: drives the <video> element with
 * HLS.js or DirectPlay, handles blob-based subtitle tracks, fullscreen, and
 * audio/quality switching with rollback on failure.
 */
export function useWebPlayer(
    session: PlayerSession,
    controls: PlayerControls,
    videoEl: Ref<HTMLVideoElement | null>,
    isNative: boolean,
) {
    const {
        itemId, requestHeaders, plan,
        isLoading, isPlaying, currentTime, duration, progressPct, error,
        hlsUrl, playMethod,
        audioList, selectedAudioIndex, subtitleList, selectedSubtitleIndex,
        activeBurnInSubtitleIndex,
        selectedBitrate, isSwitching, isOfflinePlayback,
        reportPlaybackProgress, startProgressReporting, stopProgressReporting,
        deleteActiveEncodings, negotiate, applyPlan,
        parseAudioStreams, parseSubtitleStreams,
    } = session;

    const preferencesStore = usePreferencesStore();

    let hls: Hls | null = null;

    // Active track — blob: URL so the browser never hits the cross-origin <track> restriction
    const activeTrackBlobUrl = ref<string | null>(null);
    const activeTrackLang = ref('und');
    const activeTrackLabel = ref('');
    const subtitleBlobCache = new Map<number, string>(); // index → blob URL

    const isFullscreen = ref(false);

    // ── Video event handlers ───────────────────────────────────────────────────

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
    }

    function onEnded() {
        isPlaying.value = false;
        stopProgressReporting();
    }

    // ── Playback controls ──────────────────────────────────────────────────────

    function togglePlayPause() {
        const video = videoEl.value;
        if (!video) return;
        if (video.paused) {
            video.play().then(() => { if (!isOfflinePlayback.value) reportPlaybackProgress(); });
        } else {
            video.pause();
            if (!isOfflinePlayback.value) reportPlaybackProgress();
        }
    }

    function seek(time: number) {
        const video = videoEl.value;
        if (!video || !Number.isFinite(duration.value) || duration.value <= 0) return;
        video.currentTime = Math.max(0, Math.min(duration.value, time));
        currentTime.value = video.currentTime;
        progressPct.value = (currentTime.value / duration.value) * 100;
        if (!isOfflinePlayback.value) reportPlaybackProgress();
    }

    function doubleTapSeek(deltaSec: number) {
        const video = videoEl.value;
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + deltaSec));
        if (!isOfflinePlayback.value) reportPlaybackProgress();
        controls.showSeekFeedback(deltaSec);
    }

    // ── Fullscreen ─────────────────────────────────────────────────────────────

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

    function onFullscreenChange() { isFullscreen.value = !!getFullscreenElement(); }

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

    // ── Subtitles ──────────────────────────────────────────────────────────────

    function persistSubtitleSelection(index: number | null) {
        const selectedTrack = subtitleList.value.find(track => track.index === index);
        const storedValue = selectedTrack?.playbackMode === 'burn-in'
            ? `burn-in:${index}`
            : index !== null ? String(index) : 'off';
        localStorage.setItem(`msplayer-subtitle-${itemId}`, storedValue);
    }

    async function switchSubtitle(index: number | null) {
        if (index === selectedSubtitleIndex.value || isSwitching.value) return;
        controls.subtitleMenuOpen.value = false;
        const selectedTrack = subtitleList.value.find(track => track.index === index);
        const requiresRestart = selectedTrack?.playbackMode === 'burn-in'
            || activeBurnInSubtitleIndex.value !== null;

        if (requiresRestart) {
            await restartWithSubtitle(index);
            return;
        }

        selectedSubtitleIndex.value = index;
        persistSubtitleSelection(index);
    }

    async function applySubtitleTracks() {
        const index = selectedSubtitleIndex.value;
        if (index === null) {
            activeTrackBlobUrl.value = null;
            return;
        }
        const sub = subtitleList.value.find(s => s.index === index);
        if (
            !sub?.deliveryUrl
            || sub.playbackMode === 'burn-in'
            || isSwitching.value
        ) {
            activeTrackBlobUrl.value = null;
            return;
        }

        // Fetch and cache as a blob: URL — bypasses the browser's cross-origin <track> block
        let blobUrl = subtitleBlobCache.get(index);
        if (!blobUrl) {
            try {
                // Local media:// sidecars need no token — and the custom header
                // would trigger a CORS preflight the protocol handler rejects.
                const init = sub.deliveryUrl.startsWith('http')
                    ? { headers: requestHeaders.value }
                    : undefined;
                const resp = await fetch(sub.deliveryUrl, init);
                // <track> reads WebVTT only: SRT sidecars (Plex) are converted.
                blobUrl = sub.deliveryFormat === 'srt'
                    ? URL.createObjectURL(new Blob([srtToVtt(await resp.text())], { type: 'text/vtt' }))
                    : URL.createObjectURL(await resp.blob());
                subtitleBlobCache.set(index, blobUrl);
            } catch (e) {
                logger.error('[subtitle] fetch failed:', e);
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

    function adjustSubtitleSize(delta: number) {
        const clamped = Math.min(2.0, Math.max(0.5, preferencesStore.subtitleSize + delta));
        preferencesStore.subtitleSize = Math.round(clamped * 4) / 4; // snap to 0.25 steps
        if (isNative) {
            NativeVideo.setSubtitleSize({ scale: preferencesStore.subtitleSize });
        }
    }

    // ── HLS.js / DirectPlay init ───────────────────────────────────────────────

    function initHls(url: string, video: HTMLVideoElement, startSeconds?: number, onFatalError?: () => void) {
        if (Hls.isSupported()) {
            hls = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                fLoader: makeJellyfinFragmentLoader() as any,
                xhrSetup: (xhr) => {
                    for (const [name, value] of Object.entries(requestHeaders.value)) xhr.setRequestHeader(name, value);
                },
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
                    logger.error('[HLS] fatal error:', data.type, data.details);
                    // Always destroy the dead instance so hls is never left as a zombie
                    hls?.destroy();
                    hls = null;
                    if (onFatalError) {
                        onFatalError();
                    } else {
                        error.value = i18n.global.t('player.errors.playbackError', { type: data.type });
                        isLoading.value = false;
                    }
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS cannot attach headers to <video> manifest/segment requests.
            video.src = plan.value?.url === url ? plan.value.mediaElementUrl : url;
            video.play().catch(() => { });
            startProgressReporting();
        } else {
            error.value = i18n.global.t('player.errors.hlsUnsupported');
            isLoading.value = false;
        }
    }

    /**
     * Start DirectPlay on the raw file URL (hlsUrl). When resuming, the seek runs
     * after metadata loads to avoid a brief flash from position 0.
     */
    function startDirectPlay(video: HTMLVideoElement, startSeconds?: number) {
        video.src = hlsUrl.value;
        if (startSeconds && startSeconds > 0) {
            const seekOnce = () => {
                video.removeEventListener('loadedmetadata', seekOnce);
                video.currentTime = startSeconds;
                video.play().catch(() => { });
                startProgressReporting();
                applySubtitleTracks();
            };
            video.addEventListener('loadedmetadata', seekOnce);
        } else {
            video.play().catch(() => { });
            startProgressReporting();
            applySubtitleTracks();
        }
    }

    async function restartWithSubtitle(index: number | null) {
        if (isSwitching.value) return;
        const video = videoEl.value;
        if (!video) return;

        const selectedTrack = subtitleList.value.find(track => track.index === index);
        const nextBurnInIndex = selectedTrack?.playbackMode === 'burn-in'
            ? index ?? undefined
            : undefined;
        const previousIndex = selectedSubtitleIndex.value;
        const previousBurnInIndex = activeBurnInSubtitleIndex.value;
        const movieTime = video.currentTime;

        isSwitching.value = true;
        isLoading.value = true;
        video.pause();
        stopProgressReporting();
        if (hls) { hls.destroy(); hls = null; }
        video.removeAttribute('src');
        video.load();
        await deleteActiveEncodings();

        try {
            const next = await negotiate({
                native: false,
                startSeconds: movieTime,
                audioIndex: selectedAudioIndex.value ?? undefined,
                forceTranscode: true,
                burnInSubtitleIndex: nextBurnInIndex,
            });
            applyPlan(next);
            selectedSubtitleIndex.value = index;
            activeBurnInSubtitleIndex.value = nextBurnInIndex ?? null;
            persistSubtitleSelection(index);
            parseAudioStreams(next.version, selectedAudioIndex.value ?? undefined);
            parseSubtitleStreams(next.version);

            if (playMethod.value === 'DirectPlay') {
                startDirectPlay(video, movieTime);
            } else {
                initHls(hlsUrl.value, video, movieTime);
            }
        } catch (switchError) {
            logger.error('[switchWebSubtitle] error:', switchError);
            selectedSubtitleIndex.value = previousIndex;
            activeBurnInSubtitleIndex.value = previousBurnInIndex;
            persistSubtitleSelection(previousIndex);
            error.value = i18n.global.t('player.errors.subtitleRevert');
            await initPlayer(
                movieTime,
                selectedAudioIndex.value ?? undefined,
                previousBurnInIndex ?? undefined,
            );
        } finally {
            isSwitching.value = false;
        }
    }

    // ── Player init ────────────────────────────────────────────────────────────

    async function initPlayer(
        resumeSeconds?: number,
        preferredAudioIndex?: number,
        burnInSubtitleIndex?: number,
    ) {
        const video = videoEl.value;
        if (!video) return;
        isLoading.value = true;

        try {
            // Force a transcode when resuming so the server returns an HLS stream.
            // DirectPlay serves the raw file and relies on video.currentTime seeking, which
            // is unreliable for MKV/HEVC content. HLS from the resume point is the reliable path.
            const isResuming = Boolean(resumeSeconds && resumeSeconds > 0);
            const next = await negotiate({
                native: false,
                startSeconds: resumeSeconds,
                audioIndex: preferredAudioIndex,
                forceTranscode: isResuming || burnInSubtitleIndex !== undefined,
                burnInSubtitleIndex,
            });
            applyPlan(next);
            activeBurnInSubtitleIndex.value = burnInSubtitleIndex ?? null;
            parseAudioStreams(next.version, preferredAudioIndex);
            parseSubtitleStreams(next.version);

            if (playMethod.value === 'DirectPlay') {
                startDirectPlay(video, resumeSeconds);
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
            logger.error('[initPlayer] error:', e);
            error.value = i18n.global.t('player.errors.webInitFailed');
            isLoading.value = false;
        }
    }

    // ── Audio track switching ──────────────────────────────────────────────────

    // Restart playback after a failed audio switch. Fetches a fresh session for
    // previousIndex from movieTime and re-initialises the player. Called from both
    // the synchronous catch path and the async HLS.js fatal-error callback.
    async function rollbackAudio(previousIndex: number | null, movieTime: number) {
        logger.warn('[rollbackAudio] reverting to index', previousIndex, 'at', movieTime);

        // Ensure any partially-initialised HLS instance is gone before we start fresh
        if (hls) { hls.destroy(); hls = null; }
        const video = videoEl.value;
        if (video) { video.removeAttribute('src'); video.load(); }

        error.value = i18n.global.t('player.errors.audioRevert');
        selectedAudioIndex.value = previousIndex;

        if (!video) { isLoading.value = false; return; }

        try {
            applyPlan(await negotiate({
                native: false,
                startSeconds: movieTime,
                audioIndex: previousIndex ?? undefined,
                forceTranscode: activeBurnInSubtitleIndex.value !== null,
                burnInSubtitleIndex: activeBurnInSubtitleIndex.value ?? undefined,
            }));

            if (playMethod.value === 'DirectPlay') {
                startDirectPlay(video, movieTime);
            } else {
                initHls(hlsUrl.value, video, movieTime); // if rollback itself fails, show a plain error
            }

            // Clear the revert notice once the player has recovered
            setTimeout(() => { if (isAudioRevertNotice(error.value)) error.value = null; }, 3000);
        } catch (e) {
            logger.error('[rollbackAudio] failed:', e);
            error.value = i18n.global.t('player.errors.generic');
            isLoading.value = false;
        }
    }

    async function switchAudio(index: number) {
        if (index === selectedAudioIndex.value || isSwitching.value) return;
        isSwitching.value = true;
        controls.audioMenuOpen.value = false;

        const video = videoEl.value;
        if (!video) { isSwitching.value = false; return; }

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
            // DirectPlay serves the raw file and cannot select an audio stream: ask
            // for the server stream applying the chosen track.
            applyPlan(await negotiate({
                native: false,
                startSeconds: movieTime,
                audioIndex: index,
                forceTranscode: true,
                burnInSubtitleIndex: activeBurnInSubtitleIndex.value ?? undefined,
                preferStream: true,
            }));
            selectedAudioIndex.value = index;
            const chosenLang = audioList.value.find(a => a.index === index)?.language;
            if (chosenLang) localStorage.setItem(`msplayer-audio-${itemId}`, chosenLang);

            // Pass rollback as the fatal-error callback so an async HLS.js failure also
            // triggers recovery — not just synchronous errors caught below.
            initHls(hlsUrl.value, video, movieTime, () => rollbackAudio(previousIndex, movieTime));
        } catch (e: any) {
            logger.error('[switchAudio] error:', e);
            await rollbackAudio(previousIndex, movieTime);
        } finally {
            isSwitching.value = false;
        }
    }

    // ── Quality switching ──────────────────────────────────────────────────────

    async function switchQuality(bitrate: number) {
        if (bitrate === selectedBitrate.value || isSwitching.value) return;
        isSwitching.value = true;
        controls.qualityMenuOpen.value = false;

        const video = videoEl.value;
        if (!video) { isSwitching.value = false; return; }

        isLoading.value = true;
        const movieTime = video.currentTime;
        const previousBitrate = selectedBitrate.value;

        video.pause();
        stopProgressReporting();
        if (hls) { hls.destroy(); hls = null; }
        video.removeAttribute('src');
        video.load();
        await deleteActiveEncodings();

        try {
            selectedBitrate.value = bitrate;
            preferencesStore.preferredBitrate = bitrate;
            // A bitrate cap (or a burned-in subtitle) needs a real re-encode: use the server stream.
            const isForced = bitrate > 0 || activeBurnInSubtitleIndex.value !== null;
            const next = await negotiate({
                native: false,
                startSeconds: movieTime,
                audioIndex: selectedAudioIndex.value ?? undefined,
                forceTranscode: isForced,
                burnInSubtitleIndex: activeBurnInSubtitleIndex.value ?? undefined,
                preferStream: isForced,
            });
            applyPlan(next);
            parseAudioStreams(next.version, selectedAudioIndex.value ?? undefined);
            parseSubtitleStreams(next.version);
            if (playMethod.value === 'DirectPlay') {
                startDirectPlay(video, movieTime);
            } else {
                initHls(hlsUrl.value, video, movieTime);
            }
        } catch (e: any) {
            logger.error('[switchQuality] error:', e);
            selectedBitrate.value = previousBitrate;
            error.value = i18n.global.t('player.errors.qualitySwitchFailed');
            isLoading.value = false;
        } finally {
            isSwitching.value = false;
        }
    }

    // ── Cleanup ────────────────────────────────────────────────────────────────

    function dispose() {
        hls?.destroy();
        hls = null;

        subtitleBlobCache.forEach(url => URL.revokeObjectURL(url));
        subtitleBlobCache.clear();

        // Revoke blob URL if offline playback created one
        if (isOfflinePlayback.value && hlsUrl.value.startsWith('blob:')) {
            URL.revokeObjectURL(hlsUrl.value);
        }

        const video = videoEl.value;
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
        }
    }

    return {
        // Template state
        activeTrackBlobUrl,
        activeTrackLang,
        activeTrackLabel,
        isFullscreen,
        // <video> event handlers
        onLoadStart,
        onCanPlay,
        onWaiting,
        onPlaying,
        onPause,
        onTimeUpdate,
        onLoadedMetadata,
        onEnded,
        onFullscreenChange,
        // Controls
        togglePlayPause,
        seek,
        doubleTapSeek,
        toggleFullscreen,
        switchSubtitle,
        adjustSubtitleSize,
        switchAudio,
        switchQuality,
        // Lifecycle
        initPlayer,
        dispose,
    };
}

export type WebPlayer = ReturnType<typeof useWebPlayer>;
