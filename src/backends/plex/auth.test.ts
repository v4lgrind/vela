import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/domain';
import type { AuthStep, ClientIdentity } from '@/domain';

import { createPlexAuthenticator } from './auth';
import { isPrivatePlexDirect, orderConnections, raceConnections, savedConnections } from './connect';

const identity: ClientIdentity = { product: 'Vela', version: '1.0.0', deviceName: 'Phone', platform: 'Android' };
const MACHINE = 'machine-1';

type Handler = (url: URL, init: RequestInit) => unknown | Promise<unknown>;

function serve(routes: Record<string, Handler>) {
  const calls: { method: string; url: URL; headers: Record<string, string> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    calls.push({ method: init.method ?? 'GET', url, headers: init.headers as Record<string, string> });
    const key = `${init.method ?? 'GET'} ${url.origin}${url.pathname}`;
    const handler = routes[key];
    if (!handler) return new Response('', { status: 404 });
    const body = await handler(url, init);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200 });
  }));
  return calls;
}

const resource = (over: Record<string, unknown> = {}) => ({
  name: 'Home server',
  clientIdentifier: MACHINE,
  provides: 'server',
  owned: false,
  presence: true,
  accessToken: 'server-token',
  connections: [
    { uri: 'https://relay.example', local: false, relay: true },
    { uri: 'https://lan.example', local: true, relay: false },
  ],
  ...over,
});

const homeRoutes = (extra: Record<string, Handler> = {}): Record<string, Handler> => ({
  'POST https://plex.tv/api/v2/pins': () => ({ id: 7, code: 'ABCD', expiresIn: 900 }),
  'GET https://plex.tv/api/v2/pins/7': () => ({ id: 7, code: 'ABCD', authToken: 'account-token' }),
  'GET https://plex.tv/api/v2/user': () => ({ id: 1, uuid: 'owner-uuid', title: 'Owner' }),
  'GET https://plex.tv/api/v2/home/users': () => ({
    users: [
      { id: 1, uuid: 'owner-uuid', title: 'Owner', admin: true, protected: true },
      { id: 2, uuid: 'kid-uuid', title: 'Kid', thumb: 'https://plex.tv/kid.png', protected: false },
    ],
  }),
  'POST https://plex.tv/api/v2/home/users/kid-uuid/switch': () => ({ id: 2, uuid: 'kid-uuid', title: 'Kid', authToken: 'kid-token' }),
  'POST https://plex.tv/api/v2/home/users/owner-uuid/switch': (url) =>
    url.searchParams.get('pin') === '1234' ? { id: 1, uuid: 'owner-uuid', title: 'Owner', authToken: 'owner-token' } : new Response('', { status: 403 }),
  'GET https://plex.tv/api/v2/resources': () => [resource(), { ...resource(), provides: 'player', clientIdentifier: 'tv' }],
  'GET https://lan.example/identity': () => ({ MediaContainer: { machineIdentifier: MACHINE } }),
  'GET https://relay.example/identity': () => ({ MediaContainer: { machineIdentifier: MACHINE } }),
  ...extra,
});

async function approved(): Promise<AuthStep> {
  const session = await createPlexAuthenticator(identity).startDeviceCode('client-1');
  const status = await session.poll();
  if (status.status !== 'approved') throw new Error(`expected approved, got ${status.status}`);
  return status.next;
}

afterEach(() => vi.unstubAllGlobals());

describe('Plex sign-in', () => {
  it('shows the plex.tv/link code and waits for approval', async () => {
    serve({ ...homeRoutes(), 'GET https://plex.tv/api/v2/pins/7': () => ({ id: 7, code: 'ABCD', authToken: null }) });
    const session = await createPlexAuthenticator(identity).startDeviceCode('client-1');
    expect(session.challenge).toMatchObject({ code: 'ABCD', verificationUrl: 'https://plex.tv/link' });
    expect(session.challenge.expiresAtMs).toBeGreaterThan(Date.now());
    expect(await session.poll()).toEqual({ status: 'pending' });
    session.cancel();
    expect(await session.poll()).toEqual({ status: 'expired' });
  });

  it('identifies Vela on plex.tv with the client id', async () => {
    const calls = serve(homeRoutes());
    await createPlexAuthenticator(identity).startDeviceCode('client-1');
    expect(calls[0].headers).toMatchObject({ 'X-Plex-Product': 'Vela', 'X-Plex-Client-Identifier': 'client-1', Accept: 'application/json' });
    expect(calls[0].url.searchParams.get('strong')).toBe('false');
  });

  it('lists Home profiles, switches to one and connects with its server token', async () => {
    const calls = serve(homeRoutes());
    const step = await approved();
    if (step.step !== 'choose-profile') throw new Error(step.step);
    expect(step.profiles).toEqual([
      { id: 'owner-uuid', name: 'Owner', avatarUrl: undefined, isAdmin: true, needsPin: true },
      { id: 'kid-uuid', name: 'Kid', avatarUrl: 'https://plex.tv/kid.png', isAdmin: false, needsPin: false },
    ]);

    const connected = await step.choose('kid-uuid');
    if (connected.step !== 'connected') throw new Error(connected.step);
    expect(connected.token).toBe('server-token');
    expect(connected.account).toEqual({ key: 'plex-account:owner-uuid', token: 'account-token' });
    expect(connected.connection).toMatchObject({
      kind: 'plex',
      serverId: MACHINE,
      serverName: 'Home server',
      user: { id: 'kid-uuid', name: 'Kid' },
      baseUrl: 'https://lan.example',
      candidateUrls: ['https://lan.example', 'https://relay.example'],
      tokenKey: `plex:${MACHINE}:kid-uuid`,
      deviceId: 'client-1',
      accountKey: 'plex-account:owner-uuid',
    });
    const resources = calls.find((c) => c.url.pathname === '/api/v2/resources');
    expect(resources?.headers['X-Plex-Token']).toBe('kid-token');
  });

  it('rejects a wrong profile PIN as invalid credentials', async () => {
    serve(homeRoutes());
    const step = await approved();
    if (step.step !== 'choose-profile') throw new Error(step.step);
    await expect(step.choose('owner-uuid', '0000')).rejects.toMatchObject({ reason: 'invalid-credentials' });
    await expect(step.choose('owner-uuid', '1234')).resolves.toMatchObject({ step: 'connected' });
  });

  it('skips the profile choice for an account without a Home', async () => {
    serve(homeRoutes({ 'GET https://plex.tv/api/v2/home/users': () => new Response('', { status: 400 }) }));
    const step = await approved();
    expect(step).toMatchObject({ step: 'connected', connection: { user: { id: 'owner-uuid', name: 'Owner' } } });
  });

  it('asks which server when the profile has several', async () => {
    serve(homeRoutes({
      'GET https://plex.tv/api/v2/resources': () => [resource(), resource({ name: 'Other', clientIdentifier: 'machine-2', presence: false })],
    }));
    const profiles = await approved();
    if (profiles.step !== 'choose-profile') throw new Error(profiles.step);
    const step = await profiles.choose('kid-uuid');
    if (step.step !== 'choose-server') throw new Error(step.step);
    expect(step.servers).toEqual([
      { id: MACHINE, name: 'Home server', isOwned: false, isOnline: true },
      { id: 'machine-2', name: 'Other', isOwned: false, isOnline: false },
    ]);
    await expect(step.choose(MACHINE)).resolves.toMatchObject({ step: 'connected' });
  });

  it('switches profile later from the stored account token', async () => {
    serve(homeRoutes());
    const step = await createPlexAuthenticator(identity).resumeAccount!('account-token', 'client-1');
    expect(step.step).toBe('choose-profile');
  });

  it('reports an unreachable server', async () => {
    serve(homeRoutes({
      'GET https://lan.example/identity': () => new Response('', { status: 500 }),
      'GET https://relay.example/identity': () => new Response('', { status: 500 }),
    }));
    const step = await approved();
    if (step.step !== 'choose-profile') throw new Error(step.step);
    const error = await step.choose('kid-uuid').catch((e) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect(error.reason).toBe('unreachable');
  });
});

describe('reconnect', () => {
  const saved = {
    kind: 'plex' as const, serverId: MACHINE, serverName: 'S', user: { id: 'u', name: 'U' }, tokenKey: 'k', deviceId: 'client-1',
    baseUrl: 'https://lan.example', candidateUrls: ['https://lan.example', 'https://wan.example'],
  };

  it('keeps the saved address while it answers', async () => {
    serve(homeRoutes({ 'GET https://wan.example/identity': () => ({ MediaContainer: { machineIdentifier: MACHINE } }) }));
    expect(await createPlexAuthenticator(identity).reconnect!(saved, 'server-token')).toBe('https://lan.example');
  });

  it('moves to another saved address away from home', async () => {
    serve({ 'GET https://wan.example/identity': () => ({ MediaContainer: { machineIdentifier: MACHINE } }) });
    expect(await createPlexAuthenticator(identity).reconnect!(saved, 'server-token')).toBe('https://wan.example');
  });
});

const identityAfter = (ms: number) => (_url: URL, init: RequestInit) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => resolve({ MediaContainer: { machineIdentifier: MACHINE } }), ms);
  init.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); });
});

describe('address preference', () => {
  const LAN = 'https://192-168-1-10.abc123.plex.direct:32400';
  const WAN = 'https://203-0-113-7.abc123.plex.direct:32400';
  const both = [{ uri: WAN, local: false, relay: false }, { uri: LAN, local: true, relay: false }];

  it('takes the local address even when the public one answers first (no NAT loopback)', async () => {
    serve({ [`GET ${LAN}/identity`]: identityAfter(60), [`GET ${WAN}/identity`]: identityAfter(5) });
    expect(await raceConnections(both, MACHINE, {})).toBe(LAN);
  });

  it('falls back to the public address when the local one never answers', async () => {
    serve({ [`GET ${LAN}/identity`]: identityAfter(60_000), [`GET ${WAN}/identity`]: identityAfter(5) });
    const started = Date.now();
    expect(await raceConnections(both, MACHINE, {})).toBe(WAN);
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
  });

  it('takes the public address at once when the local one fails', async () => {
    serve({ [`GET ${WAN}/identity`]: identityAfter(5) });
    const started = Date.now();
    expect(await raceConnections(both, MACHINE, {})).toBe(WAN);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('recognises LAN addresses in saved plex.direct names', () => {
    expect(isPrivatePlexDirect(LAN)).toBe(true);
    expect(isPrivatePlexDirect('https://10-0-0-2.abc.plex.direct:32400')).toBe(true);
    expect(isPrivatePlexDirect('https://172-20-0-2.abc.plex.direct:32400')).toBe(true);
    expect(isPrivatePlexDirect(WAN)).toBe(false);
    expect(isPrivatePlexDirect('https://172-40-0-2.abc.plex.direct:32400')).toBe(false);
    expect(savedConnections(WAN, [LAN, WAN, 'https://relay.example:8443'])).toEqual([
      { uri: LAN, local: true, relay: false, delayMs: 0 },
      { uri: WAN, local: false, relay: false, delayMs: 0 },
      { uri: 'https://relay.example:8443', local: false, relay: false, delayMs: 250 },
    ]);
  });

  it('moves a reconnect from the saved public address back to the LAN', async () => {
    serve({ [`GET ${LAN}/identity`]: identityAfter(60), [`GET ${WAN}/identity`]: identityAfter(5) });
    const saved = {
      kind: 'plex' as const, serverId: MACHINE, serverName: 'S', user: { id: 'u', name: 'U' }, tokenKey: 'k', deviceId: 'client-1',
      baseUrl: WAN, candidateUrls: [LAN, WAN],
    };
    expect(await createPlexAuthenticator(identity).reconnect!(saved, 'server-token')).toBe(LAN);
  });
});

describe('connection race', () => {
  it('orders local, remote, then relay addresses', () => {
    const ordered = orderConnections([
      { uri: 'r', local: false, relay: true },
      { uri: 'w', local: false, relay: false },
      { uri: 'l', local: true, relay: false },
    ]);
    expect(ordered.map((c) => c.uri)).toEqual(['l', 'w', 'r']);
  });

  it('ignores an address answered by another server', async () => {
    serve({
      'GET https://lan.example/identity': () => ({ MediaContainer: { machineIdentifier: 'someone-else' } }),
      'GET https://wan.example/identity': () => ({ MediaContainer: { machineIdentifier: MACHINE } }),
    });
    const winner = await raceConnections(
      [{ uri: 'https://lan.example', local: true, relay: false }, { uri: 'https://wan.example', local: false, relay: false }],
      MACHINE,
      {},
    );
    expect(winner).toBe('https://wan.example');
  });

  it('prefers a direct address over the relay', async () => {
    serve(homeRoutes());
    const winner = await raceConnections(resource().connections, MACHINE, {});
    expect(winner).toBe('https://lan.example');
  });
});
