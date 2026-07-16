interface DesktopDownloadOptions {
  estimatedSize?: number;
  headers?: Record<string, string>;
  onProgress?: (progress: DesktopMediaProgress) => void;
  operationId: string;
  relativePath: string;
  url: string;
}

function getDesktopRuntime(): DesktopRuntime {
  if (!window.desktopRuntime) {
    throw new Error('Desktop media runtime is unavailable');
  }
  return window.desktopRuntime;
}

export async function downloadDesktopMedia(options: DesktopDownloadOptions): Promise<number> {
  const runtime = getDesktopRuntime();
  const subscriptionId = options.onProgress
    ? runtime.subscribeMediaDownloadProgress(options.operationId, options.onProgress)
    : null;

  try {
    const result = await runtime.downloadMedia({
      estimatedSize: options.estimatedSize,
      headers: options.headers,
      operationId: options.operationId,
      relativePath: options.relativePath,
      url: options.url,
    });
    return result.size;
  } finally {
    if (subscriptionId !== null) {
      runtime.unsubscribeMediaDownloadProgress(subscriptionId);
    }
  }
}

export function cancelDesktopMediaDownload(operationId: string): Promise<boolean> {
  return getDesktopRuntime().cancelMediaDownload(operationId);
}

export function deleteDesktopMedia(relativePath: string): Promise<void> {
  return getDesktopRuntime().deleteMedia(relativePath);
}

export function getDesktopMediaUrl(relativePath: string): string {
  return getDesktopRuntime().getMediaUrl(relativePath);
}

export function statDesktopMedia(
  relativePath: string,
): Promise<{ exists: boolean; size: number }> {
  return getDesktopRuntime().statMedia(relativePath);
}
