import { ref, computed, type Ref } from 'vue';
import { watchThrottled } from '@vueuse/core';
import { NativeVideo } from '@/plugins/NativeVideoPlugin';
import type { PlayerSession } from './usePlayerSession';

/**
 * Intro/outro media segments: fetches the timestamps from Jellyfin, drives the
 * "Skip Intro" button visibility, and performs the skip seek (web or native).
 */
export function useSkipIntro(
    session: PlayerSession,
    videoEl: Ref<HTMLVideoElement | null>,
    isNative: boolean,
) {
    const { currentTime, serverUrl, embyAuthHeader, itemId, nativeResumeOffsetMs, reportPlaybackProgress } = session;

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
        try {
            const res = await fetch(
                `${serverUrl}/MediaSegments/${itemId}?includeSegmentTypes=Intro&includeSegmentTypes=Outro`,
                { headers: { Authorization: embyAuthHeader } },
            );
            if (!res.ok) return;
            const data = await res.json();
            const intro = (data.Items ?? []).find((s: any) => s.Type === 'Intro');
            if (intro) {
                // Timestamps are in ticks (100ns units)
                const start = intro.StartTicks / 10_000_000;
                const end = intro.EndTicks / 10_000_000;
                introEnd.value = end;
                skipPromptStart.value = start;
                skipPromptEnd.value = end + 10;
                if (isNative) {
                    // Send timestamps to the native Activity so it can show its own Skip Intro button
                    NativeVideo.setIntroTimestamps({
                        introStartMs: Math.floor(start * 1000),
                        introEndMs: Math.floor(end * 1000),
                    }).catch(() => {});
                }
            }
            const outro = (data.Items ?? []).find((s: any) => s.Type === 'Outro');
            if (outro) {
                creditsStartMs.value = Math.floor(outro.StartTicks / 10_000);
            }
        } catch { /* plugin not available or item has no segments */ }
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
