import type { ServerConnection, ServerKind } from './server';

/**
 * Sign-in is a small state machine shared by every backend, so the login page
 * renders steps instead of knowing about Jellyfin or Plex:
 *
 * - Jellyfin: password → connected, or device code (Quick Connect) → connected.
 * - Plex: device code (plex.tv/link) → choose Home profile (+ PIN) → choose server → connected.
 */
export type AuthStep =
  | { step: 'connected'; connection: ServerConnection; token: string }
  | { step: 'choose-profile'; profiles: AuthProfile[]; choose(profileId: string, pin?: string): Promise<AuthStep> }
  | { step: 'choose-server'; servers: AuthServer[]; choose(serverId: string): Promise<AuthStep> };

export type AuthErrorReason =
  | 'invalid-credentials'
  | 'unreachable'
  | 'device-code-disabled'
  | 'device-code-unsupported'
  | 'expired'
  | 'unknown';

/** Sign-in failure the login page can explain without knowing the backend. */
export class AuthError extends Error {
  constructor(
    readonly reason: AuthErrorReason,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthProfile {
  id: string;
  name: string;
  avatarUrl?: string;
  isAdmin: boolean;
  needsPin: boolean;
}

export interface AuthServer {
  id: string;
  name: string;
  isOwned: boolean;
  isOnline: boolean;
}

export interface DeviceCodeChallenge {
  code: string;
  /** Where the user types the code (plex.tv/link) or approves it (Jellyfin dashboard). */
  verificationUrl?: string;
  expiresAtMs: number;
}

export type DeviceCodeStatus =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'approved'; next: AuthStep };

export interface DeviceCodeSession {
  challenge: DeviceCodeChallenge;
  poll(): Promise<DeviceCodeStatus>;
  cancel(): void;
}

export interface PasswordSignIn {
  serverUrl: string;
  username: string;
  password: string;
  deviceId: string;
}

export interface Authenticator {
  readonly kind: ServerKind;
  readonly supportsPassword: boolean;
  readonly supportsDeviceCode: boolean;
  /** Jellyfin only: the server address the user typed. */
  signInWithPassword?(request: PasswordSignIn): Promise<AuthStep>;
  /** `deviceId` identifies this install/connection to the server. */
  startDeviceCode(deviceId: string, serverUrl?: string): Promise<DeviceCodeSession>;
}
