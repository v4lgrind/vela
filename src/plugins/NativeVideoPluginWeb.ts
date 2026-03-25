import { WebPlugin } from '@capacitor/core';
import type { NativeVideoPlugin, NativeVideoStartOptions } from './NativeVideoPlugin';

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
    async getDeviceCodecs(): Promise<{ codecs: string[] }> { return { codecs: [] }; }
    async canDecodeHevc(_options: { profile: string; level: number }): Promise<{ supported: boolean }> { return { supported: true }; }
    async setSubtitleSize(_options: { scale: number }): Promise<void> {}
    async getSafeAreaInsets(): Promise<{ top: number; bottom: number; left: number; right: number }> { return { top: 0, bottom: 0, left: 0, right: 0 }; }
}
