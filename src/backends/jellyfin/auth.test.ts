import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthStep } from '@/domain';

import { createJellyfinAuthenticator } from './auth';
import { jellyfinAuthHeader } from './http';

const identity = { product: 'Vela Android', version: '1.0.0', deviceName: 'Android', platform: 'Android' };
const SERVER = 'https://jf.example';

type Route = (init: RequestInit | undefined) => { status: number; body?: unknown };

function stubServer(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const path = url.slice(SERVER.length);
    const route = Object.entries(routes).find(([prefix]) => path.startsWith(prefix))?.[1];
    const { status, body } = route ? route(init) : { status: 404 };
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }));
  return calls;
}

const publicInfo: Route = () => ({ status: 200, body: { Id: 'srv-1', ServerName: 'Maison' } });
const authenticated = { AccessToken: 'tok', ServerId: 'srv-1', User: { Id: 'u1', Name: 'demo' } };

function connected(step: AuthStep) {
  if (step.step !== 'connected') throw new Error(`unexpected step ${step.step}`);
  return step;
}

describe('Jellyfin authenticator', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it('signs in with a password and describes the connection', async () => {
    const calls = stubServer({
      '/Users/AuthenticateByName': () => ({ status: 200, body: authenticated }),
      '/System/Info/Public': publicInfo,
    });
    const step = connected(await createJellyfinAuthenticator(identity).signInWithPassword!({
      serverUrl: SERVER, username: 'demo', password: 'pw', deviceId: 'dev-1',
    }));

    expect(step.token).toBe('tok');
    expect(step.connection).toMatchObject({
      kind: 'jellyfin', serverId: 'srv-1', serverName: 'Maison', baseUrl: SERVER,
      user: { id: 'u1', name: 'demo' }, deviceId: 'dev-1', tokenKey: 'jellyfin:srv-1:u1',
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ Username: 'demo', Pw: 'pw' });
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toContain('DeviceId="dev-1"');
  });

  it('reports wrong credentials and unreachable servers as domain errors', async () => {
    stubServer({ '/Users/AuthenticateByName': () => ({ status: 401 }) });
    const auth = createJellyfinAuthenticator(identity);
    const request = { serverUrl: SERVER, username: 'x', password: 'y', deviceId: 'd' };
    await expect(auth.signInWithPassword!(request)).rejects.toMatchObject({ reason: 'invalid-credentials', status: 401 });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(auth.signInWithPassword!(request)).rejects.toMatchObject({ reason: 'unreachable' });
  });

  it('runs Quick Connect: code, pending, then approved', async () => {
    let isApproved = false;
    stubServer({
      '/QuickConnect/Initiate': () => ({ status: 200, body: { Code: '123456', Secret: 's3cr3t' } }),
      '/QuickConnect/Connect': () => ({ status: 200, body: { Authenticated: isApproved } }),
      '/Users/AuthenticateWithQuickConnect': () => ({ status: 200, body: authenticated }),
      '/System/Info/Public': publicInfo,
    });
    const session = await createJellyfinAuthenticator(identity).startDeviceCode('dev-2', SERVER);
    expect(session.challenge.code).toBe('123456');
    expect(await session.poll()).toEqual({ status: 'pending' });

    isApproved = true;
    const state = await session.poll();
    expect(state.status).toBe('approved');
    if (state.status === 'approved') expect(connected(state.next).connection.deviceId).toBe('dev-2');
  });

  it('maps Quick Connect availability errors and expiry', async () => {
    stubServer({ '/QuickConnect/Initiate': () => ({ status: 401 }) });
    const auth = createJellyfinAuthenticator(identity);
    await expect(auth.startDeviceCode('d', SERVER)).rejects.toMatchObject({ reason: 'device-code-disabled' });

    stubServer({ '/QuickConnect/Initiate': () => ({ status: 404 }) });
    await expect(auth.startDeviceCode('d', SERVER)).rejects.toMatchObject({ reason: 'device-code-unsupported' });

    stubServer({ '/QuickConnect/Initiate': () => ({ status: 200, body: { Code: '1', Secret: 's' } }) });
    const session = await auth.startDeviceCode('d', SERVER);
    session.cancel();
    expect(await session.poll()).toEqual({ status: 'expired' });
  });

  it('percent-encodes the MediaBrowser header values', () => {
    expect(jellyfinAuthHeader(identity, 'dev 1', 't/k'))
      .toBe('MediaBrowser Client="Vela%20Android", Device="Android", DeviceId="dev%201", Version="1.0.0", Token="t%2Fk"');
  });
});
