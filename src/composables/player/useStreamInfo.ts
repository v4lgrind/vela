import { ref } from 'vue';

import type { StreamInfo as LiveStreamInfo } from '@/domain';

import type { PlayerSession } from './usePlayerSession';

const POLL_INTERVAL_MS = 5000;

/**
 * "Stream Info" modal state: polls the server's live transcoding details while
 * the modal is open, and serialises the current stream info for the native
 * player overlay.
 */
export function useStreamInfo(session: PlayerSession) {
    const { backend, plan, playMethod, videoStream, activeAudioStream } = session;

    const infoModalOpen = ref(false);
    const liveTranscodingInfo = ref<LiveStreamInfo | null>(null);
    let infoPollingInterval: ReturnType<typeof setInterval> | null = null;

    async function fetchTranscodingInfo() {
        try {
            const current = plan.value;
            liveTranscodingInfo.value = current && backend?.playback.streamInfo
                ? await backend.playback.streamInfo(current)
                : null;
        } catch { liveTranscodingInfo.value = null; }
    }

    function buildStreamInfoJson(): string {
        const vs = videoStream.value;
        const audio = activeAudioStream.value;
        const live = liveTranscodingInfo.value;
        const info: Record<string, string | number | boolean> = { playMethod: playMethod.value };
        if (live?.transcodeReasons.length) info.transcodeReason = live.transcodeReasons[0];
        if (live?.width != null) info.resolution = `${live.width}×${live.height}`;
        else if (vs?.width) info.resolution = `${vs.width}×${vs.height}`;
        info.videoCodec = live?.videoCodec ?? vs?.codec ?? '';
        info.isVideoDirect = live ? live.isVideoDirect : true;
        if (live?.bitrate) info.videoBitrate = live.bitrate;
        else if (vs?.bitrate) info.videoBitrate = vs.bitrate;
        info.framerate = (live && !live.isVideoDirect ? live.frameRate : vs?.frameRate) ?? 0;
        info.audioCodec = live?.audioCodec ?? audio?.codec ?? '';
        info.isAudioDirect = live ? live.isAudioDirect : true;
        info.audioChannels = audio?.channelLayout ?? (audio?.channels ? `${audio.channels}ch` : '');
        if (audio?.bitrate) info.audioBitrate = audio.bitrate;
        return JSON.stringify(info);
    }

    function stopPolling() {
        if (infoPollingInterval) { clearInterval(infoPollingInterval); infoPollingInterval = null; }
    }

    function openInfoModal() {
        infoModalOpen.value = true;
        fetchTranscodingInfo();
        infoPollingInterval = setInterval(fetchTranscodingInfo, POLL_INTERVAL_MS);
    }

    function closeInfoModal() {
        infoModalOpen.value = false;
        stopPolling();
        liveTranscodingInfo.value = null;
    }

    return {
        infoModalOpen,
        liveTranscodingInfo,
        fetchTranscodingInfo,
        buildStreamInfoJson,
        openInfoModal,
        closeInfoModal,
        stopPolling,
    };
}

export type StreamInfo = ReturnType<typeof useStreamInfo>;
