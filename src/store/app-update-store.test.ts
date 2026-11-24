import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { AppUpdate } from '@/plugins/AppUpdatePlugin';
import { findUpdate, type AvailableUpdate } from '@/services/appUpdate';

import { CHECK_INTERVAL_MS, useAppUpdateStore } from './app-update-store';

vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: vi.fn(async () => ({ version: '1.4.0', build: '10400' })),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));
vi.mock('@/composables/usePlatform', () => ({ usePlatform: () => ({ isAndroid: true }) }));
vi.mock('@/services/appUpdate', () => ({ findUpdate: vi.fn() }));

let progressHandler: ((e: { received: number; total: number }) => void) | undefined;
vi.mock('@/plugins/AppUpdatePlugin', () => ({
  AppUpdate: {
    canInstall: vi.fn(async () => ({ allowed: true })),
    openInstallSettings: vi.fn(async () => {}),
    download: vi.fn(async () => {
      progressHandler?.({ received: 50, total: 100 });
    }),
    cancelDownload: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
    addListener: vi.fn(async (_event: string, handler: typeof progressHandler) => {
      progressHandler = handler;
      return { remove: vi.fn(async () => {}) };
    }),
  },
}));

const v150: AvailableUpdate = {
  version: '1.5.0',
  versionCode: 1_050_000,
  apkUrl: 'https://github.com/v4lgrind/vela/releases/download/v1.5.0/Vela-1.5.0-android.apk',
  size: 1,
  notes: [],
};

describe('app update store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(findUpdate).mockResolvedValue(v150);
  });

  it('finds an update at startup and prompts for it', async () => {
    const store = useAppUpdateStore();
    await store.init();
    expect(findUpdate).toHaveBeenCalledWith(10400);
    expect(store.installedVersion).toBe('1.4.0');
    expect(store.status).toBe('available');
    expect(store.shouldPrompt).toBe(true);
  });

  it('skips the background check when the last one is recent, but not a forced one', async () => {
    const store = useAppUpdateStore();
    store.lastCheckedAt = Date.now() - CHECK_INTERVAL_MS / 2;
    await store.checkForUpdate();
    expect(findUpdate).not.toHaveBeenCalled();
    await store.checkForUpdate({ force: true });
    expect(findUpdate).toHaveBeenCalledTimes(1);
  });

  it('drops a remembered update once it is installed', async () => {
    const store = useAppUpdateStore();
    store.update = { ...v150, versionCode: 10400 };
    store.lastCheckedAt = Date.now();
    await store.init();
    expect(store.update).toBeNull();
    expect(store.shouldPrompt).toBe(false);
  });

  it('reports a failed check only when the user asked for it', async () => {
    vi.mocked(findUpdate).mockRejectedValue(new Error('offline'));
    const store = useAppUpdateStore();
    await store.checkForUpdate();
    expect(store.status).toBe('idle');
    await store.checkForUpdate({ force: true });
    expect(store.status).toBe('error');
    expect(store.error).toBe('check_failed');
  });

  it('stops prompting for a version the user put off', async () => {
    const store = useAppUpdateStore();
    await store.init();
    store.dismiss();
    expect(store.shouldPrompt).toBe(false);
  });

  it('downloads with progress, then opens the installer', async () => {
    const store = useAppUpdateStore();
    await store.init();
    await store.startUpdate();
    expect(AppUpdate.download).toHaveBeenCalledWith({ url: v150.apkUrl });
    expect(store.progress).toBe(0.5);
    expect(AppUpdate.install).toHaveBeenCalled();
    expect(store.status).toBe('installing');
  });

  it('asks for the install permission first, and continues once granted', async () => {
    vi.mocked(AppUpdate.canInstall).mockResolvedValueOnce({ allowed: false });
    const store = useAppUpdateStore();
    await store.init();
    await store.startUpdate();
    expect(store.status).toBe('needsPermission');
    expect(AppUpdate.openInstallSettings).toHaveBeenCalled();
    expect(AppUpdate.download).not.toHaveBeenCalled();

    await store.onResume();
    expect(AppUpdate.download).toHaveBeenCalled();
    expect(store.status).toBe('installing');
  });

  it('offers the update again when the user comes back without the permission', async () => {
    vi.mocked(AppUpdate.canInstall).mockResolvedValue({ allowed: false });
    const store = useAppUpdateStore();
    await store.init();
    await store.startUpdate();
    await store.onResume();
    expect(store.status).toBe('available');
    vi.mocked(AppUpdate.canInstall).mockResolvedValue({ allowed: true });
  });

  it('reinstalls without downloading again after a cancelled installer', async () => {
    const store = useAppUpdateStore();
    await store.init();
    await store.startUpdate();
    await store.onResume();
    expect(store.status).toBe('available');
    await store.startUpdate();
    expect(AppUpdate.download).toHaveBeenCalledTimes(1);
    expect(AppUpdate.install).toHaveBeenCalledTimes(2);
  });

  it('shows the native error code when the download fails', async () => {
    vi.mocked(AppUpdate.download).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'wrong_package' }));
    const store = useAppUpdateStore();
    await store.init();
    await store.startUpdate();
    expect(store.status).toBe('error');
    expect(store.error).toBe('wrong_package');
    expect(store.downloaded).toBe(false);
  });
});
