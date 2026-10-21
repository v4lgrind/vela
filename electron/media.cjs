const { createReadStream } = require("node:fs");
const {
  cp,
  mkdir,
  open,
  rename,
  rm,
  stat,
} = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");

const { app, ipcMain, net, protocol } = require("electron");

const MEDIA_SCHEME = "media";
const PROGRESS_CHANNEL = "media:download-progress";
const activeDownloads = new Map();

const MIME_TYPES = {
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".png": "image/png",
  ".srt": "application/x-subrip",
  ".ts": "video/mp2t",
  ".vtt": "text/vtt",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        corsEnabled: true,
        secure: true,
        standard: true,
        stream: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

function getMediaRoot() {
  return process.platform === "win32"
    ? app.getPath("videos")
    : app.getPath("downloads");
}

function getLegacyMediaRoot() {
  return path.join(app.getPath("userData"), "media");
}

function getFallbackMediaRoots() {
  const currentRoot = path.resolve(getMediaRoot());
  return [app.getPath("downloads"), getLegacyMediaRoot()]
    .filter((root) => path.resolve(root) !== currentRoot);
}

function resolveMediaPathFromRoot(relativePath, root) {
  if (typeof relativePath !== "string" || relativePath.includes("\0")) {
    throw new Error("Invalid media path");
  }

  const normalizedPath = relativePath.replaceAll("\\", "/");
  const mediaRoot = path.resolve(root);
  const absolutePath = path.resolve(mediaRoot, normalizedPath);
  const pathFromRoot = path.relative(mediaRoot, absolutePath);

  if (pathFromRoot.startsWith("..") || path.isAbsolute(pathFromRoot)) {
    throw new Error("Media path escapes the application directory");
  }

  return absolutePath;
}

function resolveMediaPath(relativePath) {
  return resolveMediaPathFromRoot(relativePath, getMediaRoot());
}

async function findMediaPath(relativePath) {
  const candidates = [
    resolveMediaPath(relativePath),
    ...getFallbackMediaRoots().map((root) => resolveMediaPathFromRoot(relativePath, root)),
  ];

  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // Try the next known desktop storage location.
    }
  }

  return candidates[0];
}

async function migrateLegacyMedia() {
  const relativeRoot = "Vela";
  const currentRoot = resolveMediaPath(relativeRoot);

  for (const fallbackRoot of getFallbackMediaRoots()) {
    const sourceRoot = resolveMediaPathFromRoot(relativeRoot, fallbackRoot);
    try {
      const sourceStat = await stat(sourceRoot);
      if (!sourceStat.isDirectory()) continue;
      await mkdir(path.dirname(currentRoot), { recursive: true });
      await cp(sourceRoot, currentRoot, { recursive: true, force: false });
      await rm(sourceRoot, { recursive: true, force: true });
    } catch {
      // Keep the fallback readable when migration is not possible.
    }
  }
}

function validateDownloadRequest(request) {
  if (!request || typeof request.operationId !== "string") {
    throw new Error("Invalid download operation");
  }
  if (activeDownloads.has(request.operationId)) {
    throw new Error(`Download already running: ${request.operationId}`);
  }

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS downloads are allowed");
  }
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};

  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key, value]) => typeof key === "string" && typeof value === "string"),
  );
}

function sendProgress(event, operationId, loaded, total) {
  if (event.sender.isDestroyed()) return;

  event.sender.send(PROGRESS_CHANNEL, {
    loaded,
    operationId,
    percentage: total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : -1,
    total,
  });
}

async function downloadMedia(event, request) {
  validateDownloadRequest(request);

  const destinationPath = resolveMediaPath(request.relativePath);
  const partialPath = `${destinationPath}.part`;
  const controller = new AbortController();
  activeDownloads.set(request.operationId, controller);

  try {
    const response = await net.fetch(request.url, {
      headers: sanitizeHeaders(request.headers),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed with HTTP ${response.status}`);
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    await rm(partialPath, { force: true });

    const file = await open(partialPath, "w");
    const reader = response.body.getReader();
    const contentLength = Number(response.headers.get("content-length")) || 0;
    const total = contentLength || Number(request.estimatedSize) || 0;
    let loaded = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await file.write(value);
        loaded += value.byteLength;
        sendProgress(event, request.operationId, loaded, total);
      }
    } finally {
      await file.close();
    }

    await rm(destinationPath, { force: true });
    await rename(partialPath, destinationPath);
    sendProgress(event, request.operationId, loaded, loaded);
    return { size: loaded };
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  } finally {
    activeDownloads.delete(request.operationId);
  }
}

function cancelDownload(operationId) {
  const controller = activeDownloads.get(operationId);
  if (!controller) return false;
  controller.abort();
  return true;
}

async function statMedia(relativePath) {
  try {
    const fileStat = await stat(await findMediaPath(relativePath));
    return { exists: fileStat.isFile(), size: fileStat.size };
  } catch {
    return { exists: false, size: 0 };
  }
}

async function deleteMedia(relativePath) {
  const roots = [getMediaRoot(), ...getFallbackMediaRoots()];
  await Promise.all(
    roots.map((root) => rm(resolveMediaPathFromRoot(relativePath, root), { force: true })),
  );
}

function parseRange(rangeHeader, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || "");
  if (!match) return null;

  if (!match[1]) {
    const suffixLength = Math.min(Number(match[2]), fileSize);
    return { end: fileSize - 1, start: fileSize - suffixLength };
  }

  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), fileSize - 1) : fileSize - 1;
  if (!Number.isFinite(start) || start < 0 || start > end) return null;
  return { end, start };
}

async function createMediaResponse(request) {
  const url = new URL(request.url);
  if (url.hostname !== "local") return new Response("Not found", { status: 404 });

  const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const absolutePath = await findMediaPath(relativePath);
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) return new Response("Not found", { status: 404 });

  const contentType = MIME_TYPES[path.extname(absolutePath).toLowerCase()] || "application/octet-stream";
  const range = parseRange(request.headers.get("range"), fileStat.size);
  const headers = {
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": contentType,
  };

  if (!range) {
    headers["Content-Length"] = String(fileStat.size);
    if (request.method === "HEAD") return new Response(null, { headers, status: 200 });
    const body = Readable.toWeb(createReadStream(absolutePath));
    return new Response(body, { headers, status: 200 });
  }

  headers["Content-Length"] = String(range.end - range.start + 1);
  headers["Content-Range"] = `bytes ${range.start}-${range.end}/${fileStat.size}`;
  if (request.method === "HEAD") return new Response(null, { headers, status: 206 });
  const body = Readable.toWeb(createReadStream(absolutePath, range));
  return new Response(body, { headers, status: 206 });
}

function registerMediaIpc() {
  ipcMain.handle("media:download", downloadMedia);
  ipcMain.handle("media:cancel", (_event, operationId) => cancelDownload(operationId));
  ipcMain.handle("media:stat", (_event, relativePath) => statMedia(relativePath));
  ipcMain.handle("media:delete", (_event, relativePath) => deleteMedia(relativePath));

  app.on("before-quit", () => {
    for (const controller of activeDownloads.values()) controller.abort();
  });
}

function registerMediaProtocol() {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      return await createMediaResponse(request);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

module.exports = {
  migrateLegacyMedia,
  registerMediaIpc,
  registerMediaProtocol,
  registerMediaScheme,
};
