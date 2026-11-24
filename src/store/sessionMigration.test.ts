import { describe, expect, it } from 'vitest';

import { legacyServerId, migrateLegacySession } from './sessionMigration';

const noTokens = { activeUserId: null, activeToken: null, tokenByUser: {} };

describe('migrateLegacySession', () => {
  it('turns saved servers into Jellyfin connections with per-account tokens', () => {
    const result = migrateLegacySession(
      {
        serverUrl: 'https://jf.home',
        _qcDeviceId: 'jellyfin-android-abc',
        savedServers: [
          { serverUrl: 'https://jf.home', userId: 'u1', userName: 'Alice', serverName: 'Home' },
          { serverUrl: 'https://jf.friend', userId: 'u2', userName: 'Bob', serverName: '' },
        ],
      },
      { activeUserId: 'u1', activeToken: 'active-token', tokenByUser: { u1: 'old-u1', u2: 'tok-u2' } },
      'fallback-device',
    );

    expect(result.connections).toHaveLength(2);
    const [home, friend] = result.connections;
    expect(home).toMatchObject({
      kind: 'jellyfin',
      serverId: legacyServerId('https://jf.home'),
      serverName: 'Home',
      baseUrl: 'https://jf.home',
      user: { id: 'u1', name: 'Alice' },
      deviceId: 'jellyfin-android-abc',
    });
    expect(home.tokenKey).toBe('jellyfin:url:https://jf.home:u1');
    expect(friend.serverName).toBe('jf.friend');
    expect(result.activeKey).toBe(home.tokenKey);
    // The active token wins over the per-user copy, which can be older.
    expect(result.tokens).toEqual({ [home.tokenKey]: 'active-token', [friend.tokenKey]: 'tok-u2' });
  });

  it('recovers a signed-in user that has no saved-servers entry', () => {
    const result = migrateLegacySession(
      { serverUrl: 'https://jf.home' },
      { activeUserId: 'u1', activeToken: 'tok', tokenByUser: {} },
      'fallback-device',
    );
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0].deviceId).toBe('fallback-device');
    expect(result.activeKey).toBe(result.connections[0].tokenKey);
  });

  it('keeps accounts without a token but does not activate them', () => {
    const result = migrateLegacySession(
      { serverUrl: 'https://jf.home', savedServers: [{ serverUrl: 'https://jf.home', userId: 'u1', userName: 'A' }] },
      { ...noTokens, activeUserId: 'u1' },
      'd',
    );
    expect(result.connections).toHaveLength(1);
    expect(result.activeKey).toBeNull();
    expect(result.tokens).toEqual({});
  });

  it('falls back to the deprecated inline token', () => {
    const result = migrateLegacySession(
      { savedServers: [{ serverUrl: 'https://jf.home', userId: 'u1', accessToken: 'inline' }] },
      noTokens,
      'd',
    );
    expect(Object.values(result.tokens)).toEqual(['inline']);
  });

  it('migrates nothing from an empty install', () => {
    expect(migrateLegacySession({}, noTokens, 'd')).toEqual({ connections: [], activeKey: null, tokens: {} });
  });
});
