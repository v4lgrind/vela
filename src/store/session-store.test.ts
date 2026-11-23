import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServerConnection } from '@/domain';
import { readToken, writeToken } from '@/services/tokenStorage';

import { useSessionStore } from './session-store';

vi.mock('@/services/tokenStorage', () => {
  const tokens = new Map<string, string>();
  const legacy = new Map<string, string>();
  return {
    readToken: vi.fn(async (key: string) => tokens.get(key) ?? null),
    writeToken: vi.fn(async (key: string, token: string | null) => {
      if (token) tokens.set(key, token);
      else tokens.delete(key);
    }),
    readLegacyPreference: vi.fn(async (key: string) => legacy.get(key) ?? null),
    __legacy: legacy,
    __tokens: tokens,
  };
});

function connection(overrides: Partial<ServerConnection> = {}): ServerConnection {
  return {
    kind: 'jellyfin',
    serverId: 'srv-1',
    serverName: 'Maison',
    user: { id: 'u1', name: 'demo' },
    baseUrl: 'https://jf.home',
    candidateUrls: [],
    tokenKey: 'jellyfin:srv-1:u1',
    deviceId: 'dev-1',
    ...overrides,
  };
}

async function legacyStore() {
  return (await import('@/services/tokenStorage')) as unknown as { __legacy: Map<string, string>; __tokens: Map<string, string> };
}

describe('session store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    const mocks = await legacyStore();
    mocks.__legacy.clear();
    mocks.__tokens.clear();
  });

  it('stores a finished sign-in and becomes authenticated', async () => {
    const session = useSessionStore();
    await session.settle({ step: 'connected', connection: connection(), token: 'tok' });
    expect(session.isAuthenticated).toBe(true);
    expect(session.active?.serverName).toBe('Maison');
    expect(writeToken).toHaveBeenCalledWith('jellyfin:srv-1:u1', 'tok');
  });

  it('replaces a migrated entry when the same account signs in again', async () => {
    const session = useSessionStore();
    session.connections = [connection({ serverId: 'url:https://jf.home', tokenKey: 'jellyfin:url:https://jf.home:u1' })];
    await session.settle({ step: 'connected', connection: connection(), token: 'tok' });
    expect(session.connections.map((c) => c.tokenKey)).toEqual(['jellyfin:srv-1:u1']);
  });

  it('signs out without forgetting the account, then switches back without a password', async () => {
    const session = useSessionStore();
    await session.settle({ step: 'connected', connection: connection(), token: 'tok' });
    session.signOut();
    expect(session.isAuthenticated).toBe(false);
    expect(session.connections).toHaveLength(1);
    expect(await session.switchTo('jellyfin:srv-1:u1')).toBe(true);
    expect(session.token).toBe('tok');
  });

  it('forgets an account and its token', async () => {
    const session = useSessionStore();
    await session.settle({ step: 'connected', connection: connection(), token: 'tok' });
    await session.forget('jellyfin:srv-1:u1');
    expect(session.connections).toEqual([]);
    expect(session.isAuthenticated).toBe(false);
    expect(await readToken('jellyfin:srv-1:u1')).toBeNull();
  });

  it('imports the old Jellyfin accounts once, on first restore', async () => {
    localStorage.setItem('jellyfin', JSON.stringify({
      serverUrl: 'https://jf.home',
      _qcDeviceId: 'jellyfin-android-old',
      savedServers: [{ serverUrl: 'https://jf.home', userId: 'u1', userName: 'demo', serverName: 'Maison' }],
    }));
    const mocks = await legacyStore();
    mocks.__legacy.set('jellyfin_user_id', 'u1');
    mocks.__legacy.set('jellyfin_access_token', 'legacy-tok');

    const session = useSessionStore();
    await session.restore();
    expect(session.isAuthenticated).toBe(true);
    expect(session.active).toMatchObject({ baseUrl: 'https://jf.home', deviceId: 'jellyfin-android-old' });
    expect(session.token).toBe('legacy-tok');
    expect(session.legacyMigrated).toBe(true);

    session.signOut();
    await session.restore();
    expect(session.connections).toHaveLength(1);
  });
});
