# Fix: Media Download Retry After Connection Loss

## Problem

When a media download fails due to connection loss, clicking "Download" again does nothing. The button is visible but non-functional.

## Root Cause

Three interrelated bugs in the download pipeline:

1. **Stale `downloading` status** (`src/store/download-store.ts`): The `startDownload` guard blocked retry when a task was stuck in `'downloading'` state because the native download event was never received by the JS layer.

2. **Silent early return** (`src/services/downloadService.ts`): `downloadForOffline()` returned `undefined` (no error) when `this.downloads.has(itemId)` was true. The caller then marked the task as `'completed'` even though nothing was downloaded.

3. **Async executor antipattern** (`src/services/downloadService.ts`): `new Promise(async (resolve, reject) => {...})` swallowed exceptions from `await`ed calls inside the executor, leaving the promise hanging forever and the download state permanently stuck.

## Changes Made

- `src/store/download-store.ts`: Added cross-check with `downloadService.isDownloading()` to detect and clean up stale tasks before allowing retry.
- `src/services/downloadService.ts`: Changed silent `return` to `throw` when download is already tracked. Refactored async executor to IIFE pattern with `.catch(reject)`.

## Next Steps

- Manual test on device: start download, kill network, wait for failure, restore network, retry download.
