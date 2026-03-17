import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface SubtitleTrack {
    url: string;
    lang: string;
    label: string;
}

export interface NativeVideoStartOptions {
    url: string;
    authHeader: string;
    startPositionMs?: number;
    title?: string;
    playMethod?: 'DirectPlay' | 'DirectStream' | 'Transcode';
    subtitleTracks?: SubtitleTrack[];
    qualityPresets?: string;
    selectedBitrate?: number;
    streamInfo?: string;
}

export interface NativeVideoProgressEvent {
    positionMs: number;
    durationMs: number;
}

export interface NativeVideoStoppedEvent {
    positionMs: number;
    durationMs: number;
}

export interface NativeVideoErrorEvent {
    message: string;
}

export interface NativeVideoTracksReadyEvent {
    /** JSON string containing { audioTracks: [...], subtitleTracks: [...] } */
    tracks: string;
}

export interface NativeVideoAudioSelectedEvent {
    language: string;
}

export interface NativeVideoSubtitleSelectedEvent {
    groupIndex: number;
    label: string;
}

export interface NativeVideoQualitySelectedEvent {
    bitrate: number;
}

export interface NativeVideoPlugin {
    start(options: NativeVideoStartOptions): Promise<void>;
    stop(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    seek(options: { positionMs: number }): Promise<void>;
    setIntroTimestamps(options: { introStartMs: number; introEndMs: number }): Promise<void>;
    selectAudioTrack(options: { groupIndex: number }): Promise<void>;
    selectSubtitleTrack(options: { groupIndex: number }): Promise<void>;
    nativeLog(options: { message: string }): Promise<void>;
    updateStreamInfo(options: { streamInfo: string }): Promise<void>;
    updateQualityPresets(options: { presets: string; selectedBitrate: number }): Promise<void>;

    addListener(event: 'progress', handler: (data: NativeVideoProgressEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'ended', handler: () => void): Promise<PluginListenerHandle>;
    addListener(event: 'stopped', handler: (data: NativeVideoStoppedEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'error', handler: (data: NativeVideoErrorEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'tracksReady', handler: (data: NativeVideoTracksReadyEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'audioSelected', handler: (data: NativeVideoAudioSelectedEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'subtitleSelected', handler: (data: NativeVideoSubtitleSelectedEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'qualitySelected', handler: (data: NativeVideoQualitySelectedEvent) => void): Promise<PluginListenerHandle>;

    removeAllListeners(): Promise<void>;
}

const NativeVideo = registerPlugin<NativeVideoPlugin>('NativeVideo', {
    web: () => import('./NativeVideoPluginWeb').then((m) => new m.NativeVideoPluginWeb()),
});

export { NativeVideo };
