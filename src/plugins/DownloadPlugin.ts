import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface DownloadEnqueueOptions {
  itemId: string;
  url: string;
  headers?: Record<string, string>;
  destPath: string;
  itemName?: string;
  estimatedSize?: number;
}

export interface DownloadProgressEvent {
  itemId: string;
  loaded: number;
  total: number;
}

export interface DownloadCompleteEvent {
  itemId: string;
  filePath: string;
  fileSize: number;
}

export interface DownloadFailedEvent {
  itemId: string;
  error: string;
}

export interface DownloadPluginInterface {
  enqueue(opts: DownloadEnqueueOptions): Promise<void>;
  cancel(opts: { itemId: string }): Promise<void>;
  getPendingCompletions(): Promise<{ items: Array<{ itemId: string; filePath: string; fileSize: number }> }>;
  addListener(event: 'downloadProgress', handler: (e: DownloadProgressEvent) => void): Promise<PluginListenerHandle>;
  addListener(event: 'downloadComplete', handler: (e: DownloadCompleteEvent) => void): Promise<PluginListenerHandle>;
  addListener(event: 'downloadFailed',   handler: (e: DownloadFailedEvent)   => void): Promise<PluginListenerHandle>;
}

export const DownloadPlugin = registerPlugin<DownloadPluginInterface>('Download');
