import { defineStore } from 'pinia';

import { authenticatorFor } from '@/backends/registry';
import { getClientDeviceInfo } from '@/composables/usePlatform';
import type { AuthStep, Authenticator, ClientIdentity, DeviceCodeSession, ServerConnection, ServerKind } from '@/domain';
import { readLegacyPreference, readToken, writeToken } from '@/services/tokenStorage';

import { migrateLegacySession } from './sessionMigration';
import type { LegacyJellyfinState } from './sessionMigration';

const CLIENT_VERSION = '1.0.0';
const LEGACY_STORE_KEY = 'jellyfin';
const deviceInfo = getClientDeviceInfo();

export const CLIENT_IDENTITY: ClientIdentity = {
  product: deviceInfo.clientName,
  version: CLIENT_VERSION,
  deviceName: deviceInfo.deviceName,
  platform: deviceInfo.deviceName,
};

function newDeviceId(): string {
  return `${deviceInfo.deviceIdPrefix}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Same server, same user, same kind: a fresh sign-in replaces the old entry (e.g. a migrated one). */
function isSameAccount(a: ServerConnection, b: ServerConnection): boolean {
  if (a.tokenKey === b.tokenKey) return true;
  return a.kind === b.kind && a.baseUrl === b.baseUrl && a.user.id === b.user.id;
}

function readLegacyState(): LegacyJellyfinState | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORE_KEY);
    return raw ? (JSON.parse(raw) as LegacyJellyfinState) : null;
  } catch {
    return null;
  }
}

async function readLegacyTokens(legacy: LegacyJellyfinState) {
  const tokenByUser: Record<string, string | null> = {};
  for (const server of legacy.savedServers ?? []) {
    tokenByUser[server.userId] = await readLegacyPreference(`jellyfin_token_${server.userId}`);
  }
  const activeToken = (await readLegacyPreference('jellyfin_access_token'))
    ?? localStorage.getItem('jellyfin_access_token_fallback');
  return { activeUserId: await readLegacyPreference('jellyfin_user_id'), activeToken, tokenByUser };
}

interface SessionState {
  connections: ServerConnection[];
  activeKey: string | null;
  /** Token of the active connection, loaded from secure storage (never persisted here). */
  token: string | null;
  legacyMigrated: boolean;
}

/**
 * Who is signed in, to which server. Replaces the auth half of the old
 * `jellyfin` store; the only app module allowed to reach the backend registry.
 */
export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({ connections: [], activeKey: null, token: null, legacyMigrated: false }),
  persist: { pick: ['connections', 'activeKey', 'legacyMigrated'] },
  getters: {
    active: (state): ServerConnection | null => state.connections.find((c) => c.tokenKey === state.activeKey) ?? null,
    isAuthenticated(): boolean {
      return !!this.active && !!this.token;
    },
  },
  actions: {
    /** Loads the active token; on first run after the update, imports the old Jellyfin accounts. */
    async restore(): Promise<void> {
      if (!this.legacyMigrated) await this.migrateLegacy();
      if (this.active && !this.token) this.token = await readToken(this.active.tokenKey);
    },

    async migrateLegacy(): Promise<void> {
      const legacy = readLegacyState();
      if (legacy) {
        const result = migrateLegacySession(legacy, await readLegacyTokens(legacy), newDeviceId());
        for (const [key, token] of Object.entries(result.tokens)) await writeToken(key, token);
        for (const connection of result.connections) this.upsert(connection);
        this.activeKey = this.activeKey ?? result.activeKey;
      }
      this.legacyMigrated = true;
    },

    authenticator(kind: ServerKind): Authenticator {
      return authenticatorFor(kind, CLIENT_IDENTITY);
    },


    async signInWithPassword(kind: ServerKind, serverUrl: string, username: string, password: string): Promise<AuthStep> {
      const authenticator = this.authenticator(kind);
      if (!authenticator.signInWithPassword) throw new Error(`${kind} has no password sign-in`);
      const step = await authenticator.signInWithPassword({ serverUrl, username, password, deviceId: newDeviceId() });
      return this.settle(step);
    },

    startDeviceCode(kind: ServerKind, serverUrl?: string): Promise<DeviceCodeSession> {
      return this.authenticator(kind).startDeviceCode(newDeviceId(), serverUrl);
    },

    /** Stores a finished sign-in; other steps are returned for the login page to render. */
    async settle(step: AuthStep): Promise<AuthStep> {
      if (step.step !== 'connected') return step;
      await writeToken(step.connection.tokenKey, step.token);
      this.connections = this.connections.filter((c) => !isSameAccount(c, step.connection));
      this.connections.push(step.connection);
      this.activeKey = step.connection.tokenKey;
      this.token = step.token;
      return step;
    },

    upsert(connection: ServerConnection) {
      const index = this.connections.findIndex((c) => c.tokenKey === connection.tokenKey);
      if (index >= 0) this.connections[index] = connection;
      else this.connections.push(connection);
    },

    async switchTo(tokenKey: string): Promise<boolean> {
      const connection = this.connections.find((c) => c.tokenKey === tokenKey);
      const token = connection ? await readToken(tokenKey) : null;
      if (!token) return false;
      this.activeKey = tokenKey;
      this.token = token;
      return true;
    },

    /** Leaves the account in the saved list (its token too), like the old logout. */
    signOut() {
      this.activeKey = null;
      this.token = null;
    },

    async forget(tokenKey: string): Promise<void> {
      await writeToken(tokenKey, null);
      this.connections = this.connections.filter((c) => c.tokenKey !== tokenKey);
      if (this.activeKey === tokenKey) this.signOut();
    },
  },
});
