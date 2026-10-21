import { describe, it, expect } from 'vitest';

import { letterAt } from './alphaIndex';

describe('letterAt', () => {
  const L = ['#', 'A', 'B', 'C'];

  it('maps a finger position to the letter under it', () => {
    expect(letterAt(0, 400, L)).toBe('#');
    expect(letterAt(150, 400, L)).toBe('A');
    expect(letterAt(399, 400, L)).toBe('C');
  });

  it('clamps positions outside the strip', () => {
    expect(letterAt(-20, 400, L)).toBe('#');
    expect(letterAt(900, 400, L)).toBe('C');
  });
});
