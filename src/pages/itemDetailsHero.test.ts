import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

// The hero title sits above the back/cast/info buttons; an unclamped long title grows over them.
describe('ItemDetailsPage hero', () => {
  it('clamps the title to two lines', () => {
    const src = readFileSync(resolve(__dirname, 'ItemDetailsPage.vue'), 'utf8');
    const h1 = src.match(/<h1[^>]*>/)?.[0] ?? '';
    expect(h1).toContain('line-clamp-2');
  });
});
