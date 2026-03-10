/**
 * Download Worker - handles fetch and base64 encoding off main thread
 */

interface StartMessage {
  type: 'start';
  url: string;
  itemId: string;
}

interface CancelMessage {
  type: 'cancel';
}

type WorkerMessage = StartMessage | CancelMessage;

let abortController: AbortController | null = null;

function arrayBufferToBase64(buffer: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    const chunk = buffer.subarray(i, Math.min(i + CHUNK_SIZE, buffer.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

async function handleDownload(url: string) {
  abortController = new AbortController();

  try {
    const response = await fetch(url, { signal: abortController.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Cannot read stream');

    // Use 1MB chunks for smoother writes
    const BATCH_SIZE = 1 * 1024 * 1024;

    let loaded = 0;
    let isFirstChunk = true;
    let remainder = new Uint8Array(0);
    let pendingChunks: Uint8Array[] = [];
    let pendingSize = 0;
    let lastProgressTime = 0;

    const flush = () => {
      const len = pendingChunks.reduce((s, c) => s + c.length, 0);
      if (len === 0) return;

      const buf = new Uint8Array(len);
      let off = 0;
      for (const c of pendingChunks) {
        buf.set(c, off);
        off += c.length;
      }

      const data = arrayBufferToBase64(buf);
      self.postMessage({ type: 'chunk', data, isFirst: isFirstChunk });
      isFirstChunk = false;
    };

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (remainder.length > 0) pendingChunks.push(remainder);
        flush();
        break;
      }

      loaded += value.length;

      const combined = new Uint8Array(remainder.length + value.length);
      combined.set(remainder);
      combined.set(value, remainder.length);

      const alignedLen = Math.floor(combined.length / 3) * 3;
      if (alignedLen > 0) {
        pendingChunks.push(combined.subarray(0, alignedLen));
        pendingSize += alignedLen;
      }
      remainder = combined.subarray(alignedLen).slice();

      if (pendingSize >= BATCH_SIZE) {
        flush();
        pendingChunks = [];
        pendingSize = 0;
      }

      // Progress every 1 second
      const now = Date.now();
      if (total > 0 && now - lastProgressTime >= 1000) {
        lastProgressTime = now;
        self.postMessage({
          type: 'progress',
          loaded,
          total,
          percentage: Math.round((loaded / total) * 100),
        });
      }
    }

    if (total > 0) {
      self.postMessage({ type: 'progress', loaded, total, percentage: 100 });
    }
    self.postMessage({ type: 'complete', loaded });

  } catch (error: any) {
    self.postMessage({
      type: 'error',
      message: error.name === 'AbortError' ? 'AbortError' : (error.message || 'Download failed'),
    });
  } finally {
    abortController = null;
  }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;
  if (msg.type === 'start') {
    handleDownload(msg.url);
  } else if (msg.type === 'cancel') {
    abortController?.abort();
  }
};
