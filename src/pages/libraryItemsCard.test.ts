import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

// The card actions stay visible on phones; full-size buttons hid most of a 110px-wide poster.
describe('LibraryItemsPage card actions', () => {
  it('are compact on the poster but keep a 44px touch target', () => {
    const src = readFileSync(resolve(__dirname, 'LibraryItemsPage.vue'), 'utf8');
    const overlay = src.slice(src.indexOf('<!-- Action overlay'), src.indexOf('<div class="mt-1.5 px-0.5">'));
    const buttons = [...overlay.matchAll(/<button[\s\S]*?class="([^"]*)"/g)].map((m) => m[1]);
    expect(buttons).toHaveLength(2);
    for (const cls of buttons) {
      expect(cls).toContain('size-7');
      expect(cls).toContain('after:-inset-2');
    }
  });
});
