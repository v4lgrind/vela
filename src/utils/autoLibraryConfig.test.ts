import { describe, expect, it } from 'vitest';

import type { ServerConnection } from '@/domain';

import { autoLibraryConfig } from './autoLibraryConfig';

const connection = (kind: ServerConnection['kind']) => ({
  kind, serverId: 's', serverName: 'S', user: { id: 'u1', name: 'U' }, baseUrl: `https://${kind}.test`, candidateUrls: [], tokenKey: 'k', deviceId: 'dev-1',
}) as ServerConnection;

describe('autoLibraryConfig', () => {
  it('pushes the Plex library config on account change', () => {
    expect(autoLibraryConfig({ active: connection('plex'), token: 'tok', androidAuto: true, maxBitrate: 0 })).toEqual({
      kind: 'plex', serverUrl: 'https://plex.test', accessToken: 'tok', userId: 'u1', clientId: 'dev-1', maxBitrate: 140_000_000,
    });
  });

  it('keeps the Jellyfin config', () => {
    expect(autoLibraryConfig({ active: connection('jellyfin'), token: 'tok', androidAuto: true, maxBitrate: 320_000 })).toMatchObject({
      kind: 'jellyfin', serverUrl: 'https://jellyfin.test', maxBitrate: 320_000,
    });
  });

  it('clears the config when signed out or the server has no Android Auto', () => {
    const empty = { kind: 'jellyfin', serverUrl: '', accessToken: '', userId: '', clientId: '', maxBitrate: 140_000_000 };
    expect(autoLibraryConfig({ active: null, token: null, androidAuto: false, maxBitrate: 0 })).toEqual(empty);
    expect(autoLibraryConfig({ active: connection('plex'), token: 'tok', androidAuto: false, maxBitrate: 0 })).toEqual(empty);
  });
});
