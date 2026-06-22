import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useMetadataCacheStore } from './metadata-cache-store';

const DAY = 24 * 60 * 60 * 1000;

describe('metadata cache store (TTL)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('set() slims the item and stamps _cachedAt', () => {
    vi.setSystemTime(new Date('2026-06-17T00:00:00Z'));
    const store = useMetadataCacheStore();
    store.set({ Id: 's1', Name: 'Show', Type: 'Series', Junk: 'dropped' } as any);
    const entry = store.cache['s1'];
    expect(entry.Name).toBe('Show');
    expect(entry._cachedAt).toBe(Date.now());
    expect((entry as any).Junk).toBeUndefined();
  });

  it('set() ignores items without an Id', () => {
    const store = useMetadataCacheStore();
    store.set({ Name: 'No id' } as any);
    expect(Object.keys(store.cache)).toHaveLength(0);
  });

  it('get() returns a fresh entry and null once past the 7-day TTL', () => {
    const store = useMetadataCacheStore();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    store.set({ Id: 's1', Name: 'Show', Type: 'Series' } as any);

    expect(store.get('s1')?.Name).toBe('Show');

    vi.advanceTimersByTime(8 * DAY);
    expect(store.get('s1')).toBeNull();
    // expired entry is evicted on read
    expect(store.cache['s1']).toBeUndefined();
  });

  it('has() mirrors get() including TTL expiry', () => {
    const store = useMetadataCacheStore();
    store.set({ Id: 's2', Name: 'X', Type: 'Series' } as any);
    expect(store.has('s2')).toBe(true);
    vi.advanceTimersByTime(8 * DAY);
    expect(store.has('s2')).toBe(false);
  });

  it('pruneExpired() drops only the expired entries', () => {
    const store = useMetadataCacheStore();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    store.set({ Id: 'old', Name: 'Old', Type: 'Series' } as any);
    vi.advanceTimersByTime(8 * DAY);
    store.set({ Id: 'new', Name: 'New', Type: 'Series' } as any);

    store.pruneExpired();
    expect(store.cache['old']).toBeUndefined();
    expect(store.cache['new']).toBeDefined();
  });
});
