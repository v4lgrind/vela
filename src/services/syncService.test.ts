import { describe, it, expect, vi, beforeEach } from 'vitest';

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

/** Server user data answered to the GET, and the requests the service made. */
function stubServer(serverUserData: Record<string, any>, postStatus = 200) {
  const calls: { method: string; url: string; body?: any }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET') return new Response(JSON.stringify(serverUserData), { status: 200 });
    return new Response('{}', { status: postStatus });
  }));
  return calls;
}

beforeEach(() => vi.clearAllMocks());

describe('syncService.syncWatchProgress', () => {
  it('pushes newer local progress', async () => {
    vi.mocked(offlineDatabase.getUnsyncedProgress).mockResolvedValue([progress()]);
    const calls = stubServer({ LastPlayedDate: '2026-01-01T10:00:00Z' });

    const result = await syncService.syncWatchProgress('https://jf', 'token', 'user1');

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://jf/UserItems/e1/UserData?userId=user1',
      'POST https://jf/UserItems/e1/UserData?userId=user1',
    ]);
    expect(calls[1].body).toEqual({ PlaybackPositionTicks: 1_205_000_000, Played: false, LastPlayedDate: '2026-01-02T10:00:00.000Z' });
    expect(offlineDatabase.markProgressSynced).toHaveBeenCalledWith('e1');
    expect(result).toEqual({ synced: 1, failed: 0, kept: 0 });
  });

  it('keeps newer server progress', async () => {
    vi.mocked(offlineDatabase.getUnsyncedProgress).mockResolvedValue([progress()]);
    const calls = stubServer({ LastPlayedDate: '2026-01-03T10:00:00Z' });

    const result = await syncService.syncWatchProgress('https://jf', 'token', 'user1');

    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
    expect(offlineDatabase.markProgressSynced).toHaveBeenCalledWith('e1');
    expect(result).toEqual({ synced: 0, failed: 0, kept: 1 });
  });

  it('marks played when completed', async () => {
    vi.mocked(offlineDatabase.getUnsyncedProgress).mockResolvedValue([progress({ completed: true, percentage: 95 })]);
    const calls = stubServer({});

    await syncService.syncWatchProgress('https://jf', 'token', 'user1');

    expect(calls[1].body).toMatchObject({ Played: true, PlaybackPositionTicks: 0 });
  });

  it('counts a failed request', async () => {
    vi.mocked(offlineDatabase.getUnsyncedProgress).mockResolvedValue([progress()]);
    stubServer({}, 500);

    const result = await syncService.syncWatchProgress('https://jf', 'token', 'user1');

    expect(offlineDatabase.markProgressSynced).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, failed: 1, kept: 0 });
  });
});
