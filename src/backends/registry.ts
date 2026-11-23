import type { Authenticator, ClientIdentity, MediaBackend, ServerConnection, ServerKind } from '@/domain';

import { createJellyfinAuthenticator } from './jellyfin/auth';
import { createJellyfinBackend } from './jellyfin';
import { createPlexAuthenticator } from './plex/auth';
export { decodeStoredItem, decodeStoredLibrary } from './jellyfin/legacy';

/**
 * The only entry point from the app into the backends. Everything else in
 * `src/backends` is private to its backend (see architecture.test.ts).
 */
export function authenticatorFor(kind: ServerKind, identity: ClientIdentity): Authenticator {
  return kind === 'plex' ? createPlexAuthenticator(identity) : createJellyfinAuthenticator(identity);
}

export function createBackend(connection: ServerConnection, token: string, identity: ClientIdentity): MediaBackend {
  if (connection.kind === 'jellyfin') return createJellyfinBackend(connection, token, identity);
  throw new Error(`No backend for ${connection.kind} yet`);
}
