import type { Authenticator, ClientIdentity, ServerKind } from '@/domain';

import { createJellyfinAuthenticator } from './jellyfin/auth';

/**
 * The only entry point from the app into the backends. Everything else in
 * `src/backends` is private to its backend (see architecture.test.ts).
 */
export function authenticatorFor(kind: ServerKind, identity: ClientIdentity): Authenticator {
  if (kind === 'jellyfin') return createJellyfinAuthenticator(identity);
  throw new Error(`No authenticator for ${kind} yet`);
}
