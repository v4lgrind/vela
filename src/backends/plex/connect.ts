import { plexJson } from './http';

/** One address of a server, from plex.tv `resources`. */
export interface PlexConnection {
  uri: string;
  local: boolean;
  relay: boolean;
  /** Start this probe later (saved addresses are tried in their saved order). */
  delayMs?: number;
}

const PROBE_TIMEOUT_MS = 8000;
/** Relays are slow and bandwidth-capped: they only win when nothing else answers quickly. */
const RELAY_DELAY_MS = 1500;
/**
 * How long a better kind of address may keep the race open: a public address
 * that answers first is only taken once the local ones failed or after this
 * long (relays after twice this). Going through the public address from home
 * makes the router loop the stream back (NAT loopback), often at ~10 Mb/s.
 */
export const PREFERENCE_GRACE_MS = 1000;

/** 0 local, 1 public, 2 relay. */
const tierOf = (c: PlexConnection) => (c.relay ? 2 : c.local ? 0 : 1);

/** Local first, then remote, relays last; the order `candidateUrls` is saved in. */
export function orderConnections(connections: PlexConnection[]): PlexConnection[] {
  return [...connections].sort((a, b) => tierOf(a) - tierOf(b));
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    });
  });
}

type ProbeState = 'pending' | 'failed' | 'ok';

/**
 * The best kind of address that answered: a success is taken once every
 * address of a better kind has failed, or once the grace for its kind is over.
 */
function pickPreferred(connections: PlexConnection[], probes: Promise<string>[], startedAt: number): Promise<string> {
  const states: ProbeState[] = connections.map(() => 'pending');
  return new Promise((resolve, reject) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (settle: () => void) => {
      timers.forEach(clearTimeout);
      settle();
    };
    function decide() {
      if (states.every((state) => state === 'failed')) return finish(() => reject(new Error('All rejected')));
      const elapsed = Date.now() - startedAt;
      for (let tier = 0; tier <= 2; tier++) {
        const winner = connections.findIndex((c, i) => tierOf(c) === tier && states[i] === 'ok');
        if (winner < 0) continue;
        const betterPending = connections.some((c, i) => tierOf(c) < tier && states[i] === 'pending');
        if (!betterPending || elapsed >= tier * PREFERENCE_GRACE_MS) return finish(() => resolve(connections[winner].uri));
        return;
      }
    }
    probes.forEach((probe, i) => probe.then(
      () => { states[i] = 'ok'; decide(); },
      () => { states[i] = 'failed'; decide(); },
    ));
    for (const tier of [1, 2]) timers.push(setTimeout(decide, tier * PREFERENCE_GRACE_MS));
  });
}

/**
 * Probes every address at once and returns the best one that answers
 * `/identity` for this server (local, then public, then relay); the other
 * probes are aborted. Which addresses work depends on where the phone is.
 */
export async function raceConnections(
  connections: PlexConnection[],
  machineIdentifier: string,
  headers: Record<string, string>,
): Promise<string> {
  if (!connections.length) throw new Error('No address to try');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  async function probe(connection: PlexConnection): Promise<string> {
    const wait = connection.relay ? RELAY_DELAY_MS : connection.delayMs ?? 0;
    if (wait) await delay(wait, controller.signal);
    const identity = await plexJson<{ MediaContainer?: { machineIdentifier?: string } }>({
      baseUrl: connection.uri, path: '/identity', headers, signal: controller.signal,
    });
    const id = identity.MediaContainer?.machineIdentifier;
    if (id && id !== machineIdentifier) throw new Error('Another server answered');
    return connection.uri;
  }

  const ordered = orderConnections(connections);
  try {
    return await pickPreferred(ordered, ordered.map(probe), Date.now());
  } catch {
    throw new Error('No address of the server answered');
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

/** `https://192-168-1-10.<hash>.plex.direct:32400`: the LAN address is written in the name. */
export function isPrivatePlexDirect(uri: string): boolean {
  let host: string;
  try {
    host = new URL(uri).hostname;
  } catch {
    return false;
  }
  const match = /^(\d+)-(\d+)-\d+-\d+\.[0-9a-f]+\.plex\.direct$/i.exec(host);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Saved addresses for a reconnect (they were saved local, public, relay): LAN
 * ones are recognised by their name, the others start one after the other so
 * the relay, saved last, starts last.
 */
export function savedConnections(baseUrl: string, candidateUrls: string[]): PlexConnection[] {
  const uris = candidateUrls.includes(baseUrl) ? candidateUrls : [baseUrl, ...candidateUrls];
  let remoteIndex = 0;
  return uris.map((uri) => {
    const local = isPrivatePlexDirect(uri);
    const delayMs = local ? 0 : Math.min(remoteIndex++ * 250, RELAY_DELAY_MS);
    return { uri, local, relay: false, delayMs };
  });
}
