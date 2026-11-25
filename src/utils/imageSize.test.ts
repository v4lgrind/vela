import { describe, it, expect } from 'vitest';

import { deviceImageSize } from './imageSize';

describe('deviceImageSize', () => {
  it('scales CSS pixels by the screen density', () => {
    expect(deviceImageSize({ width: 200, height: 300 }, 2.625)).toEqual({ width: 525, height: 788 });
  });

  it('keeps the size as is on a 1x screen or without a ratio', () => {
    expect(deviceImageSize({ width: 200, height: 300 }, 1)).toEqual({ width: 200, height: 300 });
    expect(deviceImageSize({ width: 200, height: 300 }, 0)).toEqual({ width: 200, height: 300 });
  });

  it('caps the density at 3x', () => {
    expect(deviceImageSize({ width: 100 }, 4)).toEqual({ width: 300 });
  });

  it('caps the longest edge and keeps the aspect ratio', () => {
    expect(deviceImageSize({ width: 960, height: 540 }, 3)).toEqual({ width: 1920, height: 1080 });
  });

  it('leaves an empty size empty (original image)', () => {
    expect(deviceImageSize({}, 3)).toEqual({});
  });
});
