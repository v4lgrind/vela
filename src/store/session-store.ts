import { markRaw } from 'vue';
import { defineStore } from 'pinia';

import { authenticatorFor, createBackend, decodeStoredItem, decodeStoredLibrary } from '@/backends/registry';
import { getClientDeviceInfo } from '@/composables/usePlatform';
import type {
  AuthStep, Authenticator, ClientIdentity, DeviceCodeSession, MediaBackend, ServerConnection, ServerKind,
} from '@/domain';
import { readLegacyPreference, readToken, writeToken } from '@/services/tokenStorage';

import { migrateLegacySession } from './sessionMigration';
import type { LegacyJellyfinState } from './sessionMigration';

const CLIENT_VERSION = '1.0.0';
const LEGACY_STORE_KEY = 'jellyfin';
const RECONNECT_WAIT_MS = 3000;
/** Account whose address was checked in this app run (the router restores on every navigation). */
let reconnectedKey: string | null = null;
let isReconnecting = false;
let isWatchingNetwork = false;
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
    /** Decoders for data saved in the legacy Jellyfin format (until Phase 6). */
    decodeStoredItem: () => decodeStoredItem,
    decodeStoredLibrary: () => decodeStoredLibrary,
    active: (state): ServerConnection | null => state.connections.find((c) => c.tokenKey === state.activeKey) ?? null,
    isAuthenticated(): boolean {
      return !!this.active && !!this.token;
    },
    /** The signed-in server, as a backend; recreated when the account or token changes. */
    backend(): MediaBackend | null {
      if (!this.active || !this.token) return null;
      // A backend that moves to another server address (left home…) saves it for the next start.
      return markRaw(createBackend(this.active, this.token, CLIENT_IDENTITY, { onConnectionChange: (c) => useSessionStore().upsert(c) }));
    },
  },
  actions: {
    /** Loads the active token; on first run after the update, imports the old Jellyfin accounts. */
    async restore(): Promise<void> {
      if (!this.legacyMigrated) await this.migrateLegacy();
      if (this.active && !this.token) this.token = await readToken(this.active.tokenKey);
      await this.reconnect();
    },

    /**
     * Plex servers have several addresses (LAN, public, relay): switch to the one
     * that answers now. Waits at most RECONNECT_WAIT_MS, then finishes in the background.
     */
    async reconnect(options: { force?: boolean } = {}): Promise<void> {
      const active = this.active;
      const authenticator = active ? this.authenticator(active.kind) : null;
      if (!active || !this.token || !authenticator?.reconnect || isReconnecting) return;
      if (!options.force && reconnectedKey === active.tokenKey) return;
      reconnectedKey = active.tokenKey;
      isReconnecting = true;
      const attempt = authenticator.reconnect(active, this.token).then((baseUrl) => {
        if (baseUrl !== active.baseUrl) this.upsert({ ...active, baseUrl });
      }).catch(() => undefined).finally(() => {
        isReconnecting = false;
      });
      await Promise.race([attempt, new Promise((resolve) => setTimeout(resolve, RECONNECT_WAIT_MS))]);
    },

    /**
     * Checks the server address again when the network may have changed: Wi-Fi ↔
     * mobile, back online, app back on screen (Android can switch network while
     * the app sleeps). The LAN address of a Plex server only works at home.
     */
    watchNetwork(): void {
      if (isWatchingNetwork || typeof window === 'undefined') return;
      isWatchingNetwork = true;
      const recheck = () => {
        if (document.visibilityState !== 'hidden') void this.reconnect({ force: true });
      };
      window.addEventListener('online', recheck);
      document.addEventListener('visibilitychange', recheck);
      (navigator as Navigator & { connection?: EventTarget }).connection?.addEventListener?.('change', recheck);
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

    /** Plex lists every client id as a device: reuse this install's id. */
    deviceIdFor(kind: ServerKind): string {
      return (kind === 'plex' && this.connections.find((c) => c.kind === 'plex')?.deviceId) || newDeviceId();
    },

    startDeviceCode(kind: ServerKind, serverUrl?: string): Promise<DeviceCodeSession> {
      return this.authenticator(kind).startDeviceCode(this.deviceIdFor(kind), serverUrl);
    },

    /** Plex Home: back to the profile choice without a new plex.tv/link code; null if not possible. */
    async switchProfile(): Promise<AuthStep | null> {
      const active = this.active;
      const authenticator = active ? this.authenticator(active.kind) : null;
      const accountToken = active?.accountKey ? await readToken(active.accountKey) : null;
      if (!active || !authenticator?.resumeAccount || !accountToken) return null;
      return authenticator.resumeAccount(accountToken, active.deviceId);
    },

    /** Stores a finished sign-in; other steps are returned for the login page to render. */
    async settle(step: AuthStep): Promise<AuthStep> {
      if (step.step !== 'connected') return step;
      await writeToken(step.connection.tokenKey, step.token);
      if (step.account) await writeToken(step.account.key, step.account.token);
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
      await this.reconnect();
      return true;
    },

    /** Leaves the account in the saved list (its token too), like the old logout. */
    signOut() {
      this.activeKey = null;
      this.token = null;
    },

    async forget(tokenKey: string): Promise<void> {
      const accountKey = this.connections.find((c) => c.tokenKey === tokenKey)?.accountKey;
      await writeToken(tokenKey, null);
      this.connections = this.connections.filter((c) => c.tokenKey !== tokenKey);
      if (accountKey && !this.connections.some((c) => c.accountKey === accountKey)) await writeToken(accountKey, null);
      if (this.activeKey === tokenKey) this.signOut();
    },
  },
});
