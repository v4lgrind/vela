import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface SubtitleTrack {
    url: string;
    lang: string;
    label: string;
}

export interface BurnInSubtitleTrack {
    index: number;
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
    burnInSubtitleTracks?: BurnInSubtitleTrack[];
    selectedBurnInSubtitleIndex?: number;
    qualityPresets?: string;
    selectedBitrate?: number;
    streamInfo?: string;
    audioTracksJson?: string;
    selectedAudioIndex?: number;
    subtitleTextSize?: number;
    nextEpisodeId?: string;
    chaptersJson?: string;
    creditsStartMs?: number;
    durationHintMs?: number;
    srtFilePath?: string;
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
    groupIndex: number;
}

export interface NativeVideoSubtitleSelectedEvent {
    groupIndex: number;
    label: string;
    burnInSubtitleIndex?: number;
}

export interface NativeVideoQualitySelectedEvent {
    bitrate: number;
}

export interface NativeVideoAudioErrorEvent {
    groupIndex: number;
    language: string;
}

export interface NativeVideoVideoErrorEvent {
    reason: string;
    positionMs: number;
}

export interface NativeVideoAudioSwitchJellyfinEvent {
    jellyfinIndex: number;
}

export interface NativeDeviceCapabilities {
    hardwareVideoCodecs: string[];
    softwareVideoCodecs: string[];
    platformAudioCodecs: string[];
    ffmpegAudioCodecs: string[];
    ffmpegVideoCodecs: string[];
    displayWidth: number;
    displayHeight: number;
    manufacturer: string;
    model: string;
    androidApi: number;
}

export interface VideoDecodeOptions {
    mime: string;
    profile?: string;
    level?: number;
    bitDepth?: number;
    width?: number;
    height?: number;
    frameRate?: number;
}

export interface VideoDecodeResult {
    supported: boolean;
    decoderName: string;
    reason: string;
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
    getDeviceCapabilities(): Promise<NativeDeviceCapabilities>;
    canDecodeVideo(options: VideoDecodeOptions): Promise<VideoDecodeResult>;
    setSubtitleSize(options: { scale: number }): Promise<void>;
    getSafeAreaInsets(): Promise<{ top: number; bottom: number; left: number; right: number }>;

    addListener(event: 'progress', handler: (data: NativeVideoProgressEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'ended', handler: () => void): Promise<PluginListenerHandle>;
    addListener(event: 'stopped', handler: (data: NativeVideoStoppedEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'error', handler: (data: NativeVideoErrorEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'tracksReady', handler: (data: NativeVideoTracksReadyEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'audioSelected', handler: (data: NativeVideoAudioSelectedEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'subtitleSelected', handler: (data: NativeVideoSubtitleSelectedEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'qualitySelected', handler: (data: NativeVideoQualitySelectedEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'audioError', handler: (data: NativeVideoAudioErrorEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'videoError', handler: (data: NativeVideoVideoErrorEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'audioSwitchJellyfin', handler: (data: NativeVideoAudioSwitchJellyfinEvent) => void): Promise<PluginListenerHandle>;
    addListener(event: 'nextEpisode', handler: (data: { nextEpisodeId: string }) => void): Promise<PluginListenerHandle>;
    addListener(event: 'debugLog', handler: (data: { message: string }) => void): Promise<PluginListenerHandle>;
    addListener(event: 'subtitleSizeChanged', handler: (data: { scale: number }) => void): Promise<PluginListenerHandle>;

    removeAllListeners(): Promise<void>;
}

const NativeVideo = registerPlugin<NativeVideoPlugin>('NativeVideo', {
    web: () => import('./NativeVideoPluginWeb').then((m) => new m.NativeVideoPluginWeb()),
});

export { NativeVideo };
