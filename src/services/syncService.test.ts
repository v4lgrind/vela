import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { MediaBackend } from '@/domain';

import { offlineDatabase, type WatchProgress } from './offlineDatabase';
import { syncService } from './syncService';

vi.mock('./offlineDatabase', () => ({
  offlineDatabase: { getUnsyncedProgress: vi.fn(), markProgressSynced: vi.fn() },
}));
vi.mock('./offlineDetection', () => ({ offlineDetection: { isFullyOnline: true } }));

const LOCAL_TIME = Date.parse('2026-01-02T10:00:00Z');
const progress = (over: Partial<WatchProgress> = {}): WatchProgress => ({
  itemId: 'e1', position: 120.5, duration: 3000, percentage: 4, completed: false, lastWatched: LOCAL_TIME, synced: false, ...over,
});

const push = vi.fn();
const backend = { userData: { pushOfflineProgress: push } } as unknown as MediaBackend;
const mine = () => true;

beforeEach(() => vi.clearAllMocks());

describe('syncService.syncWatchProgress', () => {
  it('pushes local progress in domain units and marks it synced', async () => {
    vi.mocked(offlineDatabase.getUnsyncedProgress).mockResolvedValue([progress({ completed: true })]);
    push.mockResolvedValue('pushed');
    expect(await syncService.syncWatchProgress(backend, mine)).toEqual({ synced: 1, failed: 0, kept: 0 });
    expect(push).toHaveBeenCalledWith({ itemId: 'e1', positionMs: 120_500, played: true, lastPlayedAtMs: LOCAL_TIME });
    expect(offlineDatabase.markProgressSynced).toHaveBeenCalledWith('e1');
  });

  it('counts progress the server kept, and marks it synced', async () => {
    vi.mocked(offlineDatabase.getUnsyncedProgress).mockResolvedValue([progress()]);
    push.mockResolvedValue('kept');
    expect(await syncService.syncWatchProgress(backend, mine)).toEqual({ synced: 0, failed: 0, kept: 1 });
    expect(offlineDatabase.markProgressSynced).toHaveBeenCalledWith('e1');
  });

  it('leaves failed pushes for the next sync', async () => {
    vi.mocked(offlineDatabase.getUnsyncedProgress).mockResolvedValue([progress()]);
    push.mockRejectedValue(new Error('HTTP 500'));
    expect(await syncService.syncWatchProgress(backend, mine)).toEqual({ synced: 0, failed: 1, kept: 0 });
    expect(offlineDatabase.markProgressSynced).not.toHaveBeenCalled();
  });

  it('keeps progress of another server for that server', async () => {
    vi.mocked(offlineDatabase.getUnsyncedProgress).mockResolvedValue([progress()]);
    expect(await syncService.syncWatchProgress(backend, () => false)).toEqual({ synced: 0, failed: 0, kept: 0 });
    expect(push).not.toHaveBeenCalled();
  });
});
