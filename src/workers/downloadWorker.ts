/**
 * Download Worker
 *
 * Handles fetch and base64 encoding off the main thread.
 * Posts encoded chunks back to main thread for filesystem writes.
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

interface ProgressMessage {
  type: 'progress';
  loaded: number;
  total: number;
  percentage: number;
}

interface ChunkMessage {
  type: 'chunk';
  data: string; // base64 encoded
  isFirst: boolean;
}

interface CompleteMessage {
  type: 'complete';
  loaded: number;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

type WorkerResponse = ProgressMessage | ChunkMessage | CompleteMessage | ErrorMessage;

let abortController: AbortController | null = null;

/**
 * Convert Uint8Array to base64
 */
function arrayBufferToBase64(buffer: Uint8Array): string {
  const CHUNK_SIZE = 0x8000; // 32KB chunks
  let binary = '';
  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    const chunk = buffer.subarray(i, Math.min(i + CHUNK_SIZE, buffer.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

async function handleDownload(url: string, itemId: string) {
  abortController = new AbortController();

  try {
    const response = await fetch(url, { signal: abortController.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Cannot read response stream');
    }

    const WRITE_BATCH = 8 * 1024 * 1024; // 8 MB batches

    let loaded = 0;
    let isFirstChunk = true;
    let remainder = new Uint8Array(0);
    let pendingChunks: Uint8Array[] = [];
    let pendingSize = 0;
    let lastProgressTime = 0;
    const PROGRESS_THROTTLE = 500;

    const flushBatch = (chunks: Uint8Array[]) => {
      const len = chunks.reduce((s, c) => s + c.length, 0);
      if (len === 0) return;

      const buf = new Uint8Array(len);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
      }

      const data = arrayBufferToBase64(buf);

      const msg: ChunkMessage = {
        type: 'chunk',
        data,
        isFirst: isFirstChunk,
      };
      self.postMessage(msg);
      isFirstChunk = false;
    };

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (remainder.length > 0) pendingChunks.push(remainder);
        flushBatch(pendingChunks);
        break;
      }

      loaded += value.length;

      // Combine with remainder for base64 alignment
      const combined = new Uint8Array(remainder.length + value.length);
      combined.set(remainder);
      combined.set(value, remainder.length);

      const alignedLen = Math.floor(combined.length / 3) * 3;
      if (alignedLen > 0) {
        pendingChunks.push(combined.subarray(0, alignedLen));
        pendingSize += alignedLen;
      }
      remainder = combined.subarray(alignedLen).slice();

      // Flush when batch is full
      if (pendingSize >= WRITE_BATCH) {
        flushBatch(pendingChunks);
        pendingChunks = [];
        pendingSize = 0;
      }

      // Throttled progress
      const now = Date.now();
      if (total > 0 && now - lastProgressTime >= PROGRESS_THROTTLE) {
        lastProgressTime = now;
        const msg: ProgressMessage = {
          type: 'progress',
          loaded,
          total,
          percentage: Math.round((loaded / total) * 100),
        };
        self.postMessage(msg);
      }
    }

    // Final progress
    if (total > 0) {
      const msg: ProgressMessage = {
        type: 'progress',
        loaded,
        total,
        percentage: 100,
      };
      self.postMessage(msg);
    }

    const completeMsg: CompleteMessage = {
      type: 'complete',
      loaded,
    };
    self.postMessage(completeMsg);

  } catch (error: any) {
    if (error.name === 'AbortError') {
      const msg: ErrorMessage = { type: 'error', message: 'AbortError' };
      self.postMessage(msg);
    } else {
      const msg: ErrorMessage = { type: 'error', message: error.message || 'Download failed' };
      self.postMessage(msg);
    }
  } finally {
    abortController = null;
  }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  if (msg.type === 'start') {
    handleDownload(msg.url, msg.itemId);
  } else if (msg.type === 'cancel') {
    if (abortController) {
      abortController.abort();
    }
  }
};
