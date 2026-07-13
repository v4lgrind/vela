import { ref } from 'vue';
import type { PlayerSession } from './usePlayerSession';

/**
 * "Stream Info" modal state: polls Jellyfin's active session for live
 * transcoding details while the modal is open, and serialises the current
 * stream info for the native player overlay.
 */
export function useStreamInfo(session: PlayerSession) {
    const { serverUrl, embyAuthHeader, deviceId, playSessionId, playMethod, videoStream, activeAudioStream } = session;

    const infoModalOpen = ref(false);
    const liveTranscodingInfo = ref<any>(null);
    let infoPollingInterval: ReturnType<typeof setInterval> | null = null;

    async function fetchTranscodingInfo() {
        try {
            const res = await fetch(
                `${serverUrl}/Sessions?activeWithinSeconds=10`,
                { headers: { 'Authorization': embyAuthHeader } }
            );
            if (!res.ok) return;
            const sessions: any[] = await res.json();
            // Match by our stable deviceId first, then fall back to playSessionId
            const jfSession = sessions.find(s => s.DeviceId === deviceId)
                ?? sessions.find(s => s.PlayState?.PlaySessionId === playSessionId.value);
            liveTranscodingInfo.value = jfSession?.TranscodingInfo ?? null;
        } catch { liveTranscodingInfo.value = null; }
    }

    function buildStreamInfoJson(): string {
        const vs = videoStream.value;
        const as_ = activeAudioStream.value;
        const ti = liveTranscodingInfo.value;
        const info: Record<string, any> = { playMethod: playMethod.value };
        if (ti?.TranscodeReasons?.length) info.transcodeReason = ti.TranscodeReasons[0];
        if (ti?.Width != null) info.resolution = `${ti.Width}×${ti.Height}`;
        else if (vs?.Width) info.resolution = `${vs.Width}×${vs.Height}`;
        info.videoCodec = ti?.VideoCodec ?? vs?.Codec ?? '';
        info.isVideoDirect = ti ? !!ti.IsVideoDirect : true;
        if (ti?.Bitrate) info.videoBitrate = ti.Bitrate;
        else if (vs?.BitRate) info.videoBitrate = vs.BitRate;
        if (ti && !ti.IsVideoDirect) info.framerate = ti.Framerate ?? 0;
        else info.framerate = vs?.RealFrameRate ?? vs?.AverageFrameRate ?? 0;
        info.audioCodec = ti?.AudioCodec ?? as_?.Codec ?? '';
        info.isAudioDirect = ti ? !!ti.IsAudioDirect : true;
        info.audioChannels = as_?.ChannelLayout ?? (as_?.Channels ? `${as_.Channels}ch` : '');
        if (as_?.BitRate) info.audioBitrate = as_.BitRate;
        return JSON.stringify(info);
    }

    function stopPolling() {
        if (infoPollingInterval) { clearInterval(infoPollingInterval); infoPollingInterval = null; }
    }

    function openInfoModal() {
        infoModalOpen.value = true;
        fetchTranscodingInfo();
        infoPollingInterval = setInterval(fetchTranscodingInfo, 5000);
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
