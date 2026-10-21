import { describe, it, expect, vi, afterEach } from 'vitest';

import { useWideLayout } from './useWideLayout';

function stubMatchMedia(initial: boolean) {
  let listener: ((e: { matches: boolean }) => void) | undefined;
  const mql = {
    matches: initial,
    addEventListener: (_: string, cb: typeof listener) => { listener = cb; },
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return (matches: boolean) => listener?.({ matches });
}

afterEach(() => vi.unstubAllGlobals());

describe('useWideLayout', () => {
  it('queries the 1024px breakpoint and follows rotation', () => {
    const fire = stubMatchMedia(false);
    const wide = useWideLayout();
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)');
    expect(wide.value).toBe(false);
    fire(true);
    expect(wide.value).toBe(true);
    fire(false);
    expect(wide.value).toBe(false);
  });
});
