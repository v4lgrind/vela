import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

const RES = resolve(__dirname, '../../android/app/src/main/res');
// Identity strings: never translated.
const NOT_TRANSLATED = ['app_name', 'package_name', 'custom_url_scheme', 'title_activity_main'];

function stringNames(file: string): string[] {
  const xml = readFileSync(file, 'utf8');
  return [...xml.matchAll(/<(?:string|plurals) name="([^"]+)"/g)].map((m) => m[1]).sort();
}

describe('Android string resources', () => {
  it('has a French translation for every user-visible string', () => {
    const fr = resolve(RES, 'values-fr/strings.xml');
    expect(existsSync(fr)).toBe(true);
    const base = stringNames(resolve(RES, 'values/strings.xml')).filter((n) => !NOT_TRANSLATED.includes(n));
    expect(base.length).toBeGreaterThan(0);
    expect(stringNames(fr)).toEqual(base);
  });
});
