import type { Authenticator, ClientIdentity, MediaBackend, ServerConnection, ServerKind } from '@/domain';

import { createJellyfinAuthenticator } from './jellyfin/auth';
import { createJellyfinBackend } from './jellyfin';

/**
 * The only entry point from the app into the backends. Everything else in
 * `src/backends` is private to its backend (see architecture.test.ts).
 */
export function authenticatorFor(kind: ServerKind, identity: ClientIdentity): Authenticator {
  if (kind === 'jellyfin') return createJellyfinAuthenticator(identity);
  throw new Error(`No authenticator for ${kind} yet`);
}

export function createBackend(connection: ServerConnection, token: string, identity: ClientIdentity): MediaBackend {
  if (connection.kind === 'jellyfin') return createJellyfinBackend(connection, token, identity);
  throw new Error(`No backend for ${connection.kind} yet`);
}
