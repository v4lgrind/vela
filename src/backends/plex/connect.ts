import { plexJson } from './http';

/** One address of a server, from plex.tv `resources`. */
export interface PlexConnection {
  uri: string;
  local: boolean;
  relay: boolean;
}

const PROBE_TIMEOUT_MS = 8000;
/** Relays are slow and bandwidth-capped: they only win when nothing else answers quickly. */
const RELAY_DELAY_MS = 1500;

/** Local first, then remote, relays last; the order `candidateUrls` is saved in. */
export function orderConnections(connections: PlexConnection[]): PlexConnection[] {
  const rank = (c: PlexConnection) => (c.relay ? 2 : c.local ? 0 : 1);
  return [...connections].sort((a, b) => rank(a) - rank(b));
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

/** First promise to fulfil; rejects once all have rejected (`Promise.any`). */
function firstFulfilled<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let pending = promises.length;
    for (const promise of promises) {
      promise.then(resolve, () => {
        pending -= 1;
        if (pending === 0) reject(new Error('All rejected'));
      });
    }
  });
}

/**
 * Probes every address at once and returns the first that answers `/identity`
 * for this server; the other probes are aborted. Plex servers list LAN,
 * public and relay addresses, and which one works depends on where the phone is.
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
    if (connection.relay) await delay(RELAY_DELAY_MS, controller.signal);
    const identity = await plexJson<{ MediaContainer?: { machineIdentifier?: string } }>({
      baseUrl: connection.uri, path: '/identity', headers, signal: controller.signal,
    });
    const id = identity.MediaContainer?.machineIdentifier;
    if (id && id !== machineIdentifier) throw new Error('Another server answered');
    return connection.uri;
  }

  try {
    return await firstFulfilled(orderConnections(connections).map(probe));
  } catch {
    throw new Error('No address of the server answered');
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
