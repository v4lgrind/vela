import { describe, it, expect, vi, afterEach } from 'vitest';

import { useImageUrl } from './useBackend';

const imageUrl = vi.fn((ref: string, size?: { width?: number; height?: number }) => `${ref}?${size?.width ?? ''}x${size?.height ?? ''}`);
vi.mock('@/store/session-store', () => ({ useSessionStore: () => ({ backend: { imageUrl } }) }));

afterEach(() => vi.unstubAllGlobals());

describe('useImageUrl', () => {
  it('asks the server for the CSS size scaled to the screen density', () => {
    vi.stubGlobal('devicePixelRatio', 2.5);
    expect(useImageUrl()('poster', { width: 200, height: 300 })).toBe('poster?500x750');
  });

  it('keeps an absent size absent (original image)', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    expect(useImageUrl()('poster')).toBe('poster?x');
  });

  it('returns an empty URL without a ref', () => {
    expect(useImageUrl()(undefined, { width: 100 })).toBe('');
  });
});
