import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import type { MediaItem } from '@/domain';

import { useMetadataCacheStore } from './metadata-cache-store';

vi.mock('./session-store', () => ({
  useSessionStore: () => ({
    decodeStoredItem: (raw: { Id: string; Name: string }) => ({ id: raw.Id, kind: 'series', title: raw.Name, credits: [] }),
  }),
}));

const DAY = 24 * 60 * 60 * 1000;
const series = (id: string, title: string, credits = 0) => ({
  id, kind: 'series', title, genres: [], studios: [], images: {}, user: { played: false, playCount: 0, favorite: false },
  credits: Array.from({ length: credits }, (_, i) => ({ name: `p${i}`, role: 'actor' })),
}) as MediaItem;

describe('metadata cache store (TTL)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('set() keeps the item, caps credits and stamps the time', () => {
    vi.setSystemTime(new Date('2026-06-17T00:00:00Z'));
    const store = useMetadataCacheStore();
    store.set(series('s1', 'Show', 30));
    const cached = store.get('s1');
    expect(cached?.title).toBe('Show');
    expect(cached && 'credits' in cached ? cached.credits.length : 0).toBe(20);
    expect((store.cache.s1 as { cachedAt: number }).cachedAt).toBe(Date.now());
  });

  it('set() ignores missing items', () => {
    const store = useMetadataCacheStore();
    store.set(null);
    expect(Object.keys(store.cache)).toHaveLength(0);
  });

  it('get() returns a fresh entry and null once past the 7-day TTL', () => {
    const store = useMetadataCacheStore();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    store.set(series('s1', 'Show'));
    expect(store.get('s1')?.title).toBe('Show');
    vi.advanceTimersByTime(8 * DAY);
    expect(store.get('s1')).toBeNull();
    expect(store.cache.s1).toBeUndefined();
    store.set(series('s2', 'X'));
    vi.advanceTimersByTime(8 * DAY);
    expect(store.get('s2', true)?.title).toBe('X');
  });

  it('decodes entries saved before the domain model once', () => {
    const store = useMetadataCacheStore();
    store.cache.old = { Id: 'old', Name: 'Legacy Show', Type: 'Series', _cachedAt: Date.now() };
    expect(store.get('old')?.title).toBe('Legacy Show');
    expect(store.cache.old).toMatchObject({ item: { id: 'old' } });
  });

  it('pruneExpired() drops only the expired entries', () => {
    const store = useMetadataCacheStore();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    store.set(series('old', 'Old'));
    vi.advanceTimersByTime(8 * DAY);
    store.set(series('new', 'New'));
    store.pruneExpired();
    expect(store.cache.old).toBeUndefined();
    expect(store.cache.new).toBeDefined();
  });
});
