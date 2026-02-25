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
    async selectAudioTrack(_options: { groupIndex: number }): Promise<void> {}
    async selectSubtitleTrack(_options: { groupIndex: number }): Promise<void> {}
}
