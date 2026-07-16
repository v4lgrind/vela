import { ref } from 'vue';

interface ControlsDeps {
    /** Called on desktop tap / Space key — the web player's play/pause toggle. */
    onTogglePlayPause: () => void;
    /** Called on touch double-tap with the seek delta in seconds (±10). */
    onDoubleTapSeek: (deltaSec: number) => void;
}

/**
 * Controls overlay state for the player page: auto-hiding controls,
 * track/quality menu visibility, and tap / double-tap gestures.
 */
export function usePlayerControls(deps: ControlsDeps) {
    const controlsVisible = ref(true);
    const audioMenuOpen = ref(false);
    const subtitleMenuOpen = ref(false);
    const qualityMenuOpen = ref(false);
    const seekFeedback = ref<'back' | 'fwd' | null>(null);

    let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
    let doubleTapTimer: ReturnType<typeof setTimeout> | null = null;
    let seekFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

    function anyMenuOpen() {
        return audioMenuOpen.value || subtitleMenuOpen.value || qualityMenuOpen.value;
    }

    function showControls() {
        controlsVisible.value = true;
        if (controlsTimeout) clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            if (!anyMenuOpen()) controlsVisible.value = false;
        }, 3000);
    }

    function hideControls() {
        if (controlsTimeout) clearTimeout(controlsTimeout);
        if (!anyMenuOpen()) {
            controlsTimeout = setTimeout(() => { controlsVisible.value = false; }, 1000);
        }
    }

    function handleVideoTap() {
        const isTouchDevice = navigator.maxTouchPoints > 0 && window.innerWidth < 1024;
        if (isTouchDevice) {
            if (controlsVisible.value) {
                hideControls();
            } else {
                showControls();
            }
        } else {
            deps.onTogglePlayPause();
        }
    }

    function handleTouchStart(e: TouchEvent) {
        const touch = e.touches[0];
        if (!touch) return;
        if (doubleTapTimer !== null) {
            clearTimeout(doubleTapTimer);
            doubleTapTimer = null;
            const isLeft = touch.clientX < (e.currentTarget as HTMLElement).clientWidth / 2;
            deps.onDoubleTapSeek(isLeft ? -10 : 10);
        } else {
            doubleTapTimer = setTimeout(() => {
                doubleTapTimer = null;
                handleVideoTap();
            }, 250);
        }
    }

    /** Flash the ±10s ripple after a double-tap seek and keep the controls visible. */
    function showSeekFeedback(deltaSec: number) {
        if (seekFeedbackTimer !== null) clearTimeout(seekFeedbackTimer);
        seekFeedback.value = deltaSec < 0 ? 'back' : 'fwd';
        seekFeedbackTimer = setTimeout(() => { seekFeedback.value = null; }, 700);
        showControls();
    }

    function handleKeyDown(e: KeyboardEvent) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.code === 'Space') { e.preventDefault(); deps.onTogglePlayPause(); }
    }

    function toggleAudioMenu() {
        const next = !audioMenuOpen.value;
        subtitleMenuOpen.value = false;
        qualityMenuOpen.value = false;
        audioMenuOpen.value = next;
        showControls(); // reset idle timer so menu stays visible
    }

    function toggleSubtitleMenu() {
        const next = !subtitleMenuOpen.value;
        audioMenuOpen.value = false;
        qualityMenuOpen.value = false;
        subtitleMenuOpen.value = next;
        showControls();
    }

    function toggleQualityMenu() {
        const next = !qualityMenuOpen.value;
        audioMenuOpen.value = false;
        subtitleMenuOpen.value = false;
        qualityMenuOpen.value = next;
        showControls();
    }

    function dispose() {
        if (controlsTimeout) clearTimeout(controlsTimeout);
    }

    return {
        controlsVisible,
        audioMenuOpen,
        subtitleMenuOpen,
        qualityMenuOpen,
        seekFeedback,
        showControls,
        hideControls,
        handleVideoTap,
        handleTouchStart,
        showSeekFeedback,
        handleKeyDown,
        toggleAudioMenu,
        toggleSubtitleMenu,
        toggleQualityMenu,
        dispose,
    };
}

export type PlayerControls = ReturnType<typeof usePlayerControls>;
