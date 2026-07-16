const { contextBridge, ipcRenderer } = require("electron");

let nextSubscriptionId = 1;
const progressSubscriptions = new Map();

function getMediaUrl(relativePath) {
  const encodedPath = relativePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  return `media://local/${encodedPath}`;
}

function subscribeMediaDownloadProgress(operationId, callback) {
  const subscriptionId = nextSubscriptionId++;
  const listener = (_event, progress) => {
    if (progress.operationId === operationId) callback(progress);
  };

  progressSubscriptions.set(subscriptionId, listener);
  ipcRenderer.on("media:download-progress", listener);
  return subscriptionId;
}

function unsubscribeMediaDownloadProgress(subscriptionId) {
  const listener = progressSubscriptions.get(subscriptionId);
  if (!listener) return;
  ipcRenderer.removeListener("media:download-progress", listener);
  progressSubscriptions.delete(subscriptionId);
}

contextBridge.exposeInMainWorld(
  "desktopRuntime",
  Object.freeze({
    cancelMediaDownload: (operationId) => ipcRenderer.invoke("media:cancel", operationId),
    deleteMedia: (relativePath) => ipcRenderer.invoke("media:delete", relativePath),
    downloadMedia: (request) => ipcRenderer.invoke("media:download", request),
    getMediaUrl,
    isDesktop: true,
    platform: process.platform,
    statMedia: (relativePath) => ipcRenderer.invoke("media:stat", relativePath),
    subscribeMediaDownloadProgress,
    unsubscribeMediaDownloadProgress,
    version: process.versions.electron,
  }),
);
