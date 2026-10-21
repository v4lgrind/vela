import { describe, it, expect } from 'vitest';

import { contentStyle, miniPlayerStyle } from './shellLayout';

const SAB = 'var(--sab, env(safe-area-inset-bottom, 0px))';
const RAIL = 'calc(88px + var(--sal, env(safe-area-inset-left, 0px)))';

describe('contentStyle', () => {
  it('offsets the page by the rail (margin, so the page keeps its own gutter) and reserves the bottom inset', () => {
    expect(contentStyle({ navVisible: true, wide: true, miniVisible: false })).toEqual({ marginLeft: RAIL, paddingBottom: SAB });
    expect(contentStyle({ navVisible: true, wide: true, miniVisible: true }))
      .toEqual({ marginLeft: RAIL, paddingBottom: `calc(72px + ${SAB})` });
  });

  it('reserves the floating bar (and the mini player above it) on narrow screens', () => {
    expect(contentStyle({ navVisible: true, wide: false, miniVisible: false })).toEqual({ paddingBottom: `calc(98px + ${SAB})` });
    expect(contentStyle({ navVisible: true, wide: false, miniVisible: true })).toEqual({ paddingBottom: `calc(98px + 64px + ${SAB})` });
  });
});

describe('miniPlayerStyle', () => {
  it('sits above the bottom inset, right of the rail, on wide screens', () => {
    expect(miniPlayerStyle({ navVisible: true, wide: true })).toEqual({ left: RAIL, bottom: SAB });
  });

  it('sits above the floating bar on narrow screens', () => {
    expect(miniPlayerStyle({ navVisible: true, wide: false })).toEqual({ bottom: `calc(90px + ${SAB})` });
  });

  it('lets the template pin it to the bottom edge when there is no nav', () => {
    expect(miniPlayerStyle({ navVisible: false, wide: true })).toBeUndefined();
  });
});
