import { WebPlugin } from '@capacitor/core';
import type {
    NativeDeviceCapabilities,
    NativeVideoPlugin,
    NativeVideoStartOptions,
    VideoDecodeOptions,
    VideoDecodeResult,
} from './NativeVideoPlugin';

/**
 * No-op web stub — all methods resolve immediately without doing anything.
 * The web/browser path uses the existing HLS.js + <video> implementation.
 */
export class NativeVideoPluginWeb extends WebPlugin implements NativeVideoPlugin {
    async start(_options: NativeVideoStartOptions): Promise<void> {
        console.warn('[NativeVideoPlugin] start() called on web — no-op');
    }

    async stop(): Promise<void> {}
    async pause(): Promise<void> {}
    async resume(): Promise<void> {}
    async seek(_options: { positionMs: number }): Promise<void> {}
    async setIntroTimestamps(_options: { introStartMs: number; introEndMs: number }): Promise<void> {}
    async selectAudioTrack(_options: { groupIndex: number }): Promise<void> {}
    async selectSubtitleTrack(_options: { groupIndex: number }): Promise<void> {}
    async nativeLog(_options: { message: string }): Promise<void> {}
    async updateStreamInfo(_options: { streamInfo: string }): Promise<void> {}
    async updateQualityPresets(_options: { presets: string; selectedBitrate: number }): Promise<void> {}
    async getDeviceCapabilities(): Promise<NativeDeviceCapabilities> {
        return {
            hardwareVideoCodecs: [],
            softwareVideoCodecs: [],
            platformAudioCodecs: [],
            ffmpegAudioCodecs: [],
            ffmpegVideoCodecs: [],
            displayWidth: 0,
            displayHeight: 0,
            manufacturer: '',
            model: '',
            androidApi: 0,
        };
    }
    async canDecodeVideo(_options: VideoDecodeOptions): Promise<VideoDecodeResult> {
        return { supported: true, decoderName: '', reason: 'web_player' };
    }
    async setSubtitleSize(_options: { scale: number }): Promise<void> {}
    async getSafeAreaInsets(): Promise<{ top: number; bottom: number; left: number; right: number }> { return { top: 0, bottom: 0, left: 0, right: 0 }; }
}
