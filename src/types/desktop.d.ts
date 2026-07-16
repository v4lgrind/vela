export {};

declare global {
  interface DesktopMediaDownloadRequest {
    readonly estimatedSize?: number;
    readonly headers?: Record<string, string>;
    readonly operationId: string;
    readonly relativePath: string;
    readonly url: string;
  }

  interface DesktopMediaProgress {
    readonly loaded: number;
    readonly operationId: string;
    readonly percentage: number;
    readonly total: number;
  }

  interface DesktopRuntime {
    cancelMediaDownload(operationId: string): Promise<boolean>;
    deleteMedia(relativePath: string): Promise<void>;
    downloadMedia(request: DesktopMediaDownloadRequest): Promise<{ size: number }>;
    getMediaUrl(relativePath: string): string;
    readonly isDesktop: true;
    readonly platform: "darwin" | "linux" | "win32";
    statMedia(relativePath: string): Promise<{ exists: boolean; size: number }>;
    subscribeMediaDownloadProgress(
      operationId: string,
      callback: (progress: DesktopMediaProgress) => void,
    ): number;
    unsubscribeMediaDownloadProgress(subscriptionId: number): void;
    readonly version: string;
  }

  interface Window {
    readonly desktopRuntime?: DesktopRuntime;
  }
}
