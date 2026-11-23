import { ref, computed, type Ref } from 'vue';
import { watchThrottled } from '@vueuse/core';
import { NativeVideo } from '@/plugins/NativeVideoPlugin';
import type { PlayerSession } from './usePlayerSession';

/**
 * Intro/credits markers: fetches them from the server, drives the
 * "Skip Intro" button visibility, and performs the skip seek (web or native).
 */
export function useSkipIntro(
    session: PlayerSession,
    videoEl: Ref<HTMLVideoElement | null>,
    isNative: boolean,
) {
    const { backend, currentTime, itemId, nativeResumeOffsetMs, reportPlaybackProgress } = session;

    const introEnd = ref<number | null>(null);
    const skipPromptStart = ref<number | null>(null);
    const skipPromptEnd = ref<number | null>(null);
    const creditsStartMs = ref<number>(-1);
    const introSkipped = ref(false);

    const showSkipIntroButton = computed(() => {
        if (introSkipped.value) return false;
        if (skipPromptStart.value === null || skipPromptEnd.value === null) return false;
        return currentTime.value >= skipPromptStart.value && currentTime.value <= skipPromptEnd.value;
    });

    // Reset introSkipped when user seeks back into or before the intro window
    watchThrottled(currentTime, (t) => {
        if (introSkipped.value && skipPromptEnd.value !== null && t < skipPromptEnd.value) {
            introSkipped.value = false;
        }
    }, { throttle: 500 });

    async function fetchIntroTimestamps() {
        if (!backend?.capabilities.markers) return;
        try {
            const markers = await backend.playback.markers(itemId);
            const intro = markers.find((m) => m.kind === 'intro');
            if (intro) {
                const start = intro.startMs / 1000;
                const end = intro.endMs / 1000;
                introEnd.value = end;
                skipPromptStart.value = start;
                skipPromptEnd.value = end + 10;
                if (isNative) {
                    // Send timestamps to the native Activity so it can show its own Skip Intro button
                    NativeVideo.setIntroTimestamps({
                        introStartMs: Math.floor(intro.startMs),
                        introEndMs: Math.floor(intro.endMs),
                    }).catch(() => {});
                }
            }
            const credits = markers.find((m) => m.kind === 'credits');
            if (credits) creditsStartMs.value = Math.floor(credits.startMs);
        } catch { /* server without markers for this item */ }
    }

    function skipIntro() {
        if (introEnd.value === null) return;
        // Immediately hide the button
        introSkipped.value = true;
        if (isNative) {
            // Native position is stream-relative for HLS transcode — subtract resume offset
            const streamMs = Math.max(0, Math.floor(introEnd.value * 1000) - nativeResumeOffsetMs.value);
            NativeVideo.seek({ positionMs: streamMs }).catch(() => {});
        } else {
            const video = videoEl.value;
            if (!video) return;
            video.currentTime = introEnd.value;
            reportPlaybackProgress();
        }
    }

    return {
        creditsStartMs,
        showSkipIntroButton,
        fetchIntroTimestamps,
        skipIntro,
    };
}

export type SkipIntro = ReturnType<typeof useSkipIntro>;
