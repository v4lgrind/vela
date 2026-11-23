import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Dependency rules of the multi-backend architecture
 * (docs/superpowers/plans/2026-11-22-plex-support.md):
 * - `domain` depends on nothing;
 * - each backend depends on `domain` and its own SDK only;
 * - the app never imports a backend or a server SDK directly.
 */

const SRC = resolve(__dirname);
const SOURCE_FILE = /\.(ts|vue)$/;
const IMPORT = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

/**
 * Files that still import the Jellyfin SDK outside `backends/jellyfin`.
 * This list may only shrink: migrate a file, then remove it here.
 */
const LEGACY_SDK_IMPORTERS = [
  'store/jellyfin-store.ts',
  'utils/detailMeta.test.ts',
  'utils/detailMeta.ts',
  'utils/lyrics.ts',
];

/** The only app module allowed into `backends`, and only through the registry. */
const BACKEND_IMPORTERS = ['store/session-store.ts'];
const REGISTRY = 'backends/registry.ts';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__fixtures__' ? [] : sourceFiles(path);
    return SOURCE_FILE.test(name) ? [path] : [];
  });
}

function importsOf(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? m[3]);
}

const files = sourceFiles(SRC).map((path) => ({ path: relative(SRC, path), imports: importsOf(path) }));
const inside = (dir: string) => files.filter((f) => f.path.startsWith(`${dir}/`));
const isTest = (path: string) => path.endsWith('.test.ts');

function violations(scope: { path: string; imports: string[] }[], isAllowed: (spec: string, path: string) => boolean): string[] {
  return scope.flatMap(({ path, imports }) => imports.filter((spec) => !isAllowed(spec, path)).map((spec) => `${path} → ${spec}`));
}

describe('architecture', () => {
  it('finds the source tree', () => {
    expect(inside('domain').length).toBeGreaterThan(0);
    expect(inside('backends').length).toBeGreaterThan(0);
  });

  it('domain imports only itself', () => {
    expect(violations(inside('domain'), (spec, path) => spec.startsWith('./') || (spec === 'vitest' && isTest(path)))).toEqual([]);
  });

  it('each backend imports only the domain, itself and its own SDK', () => {
    const allowed = (spec: string, path: string) => {
      const backend = path.split('/')[1];
      if (spec === '@/domain' || spec.startsWith('./') || spec.startsWith('../')) return true;
      if (spec === 'vitest' && isTest(path)) return true;
      return backend === 'jellyfin' && spec.startsWith('@jellyfin/sdk');
    };
    expect(violations(inside('backends'), allowed)).toEqual([]);
  });

  it('backends do not reach into each other through relative paths', () => {
    const crossing = inside('backends').flatMap(({ path, imports }) =>
      imports
        .filter((spec) => spec.startsWith('.'))
        .map((spec) => relative(SRC, resolve(SRC, path, '..', spec)))
        .filter((target) => path !== REGISTRY && target.split('/')[1] !== path.split('/')[1])
        .map((target) => `${path} → ${target}`));
    expect(crossing).toEqual([]);
  });

  it('the app does not import backends', () => {
    const app = files.filter((f) => !f.path.startsWith('backends/') && !BACKEND_IMPORTERS.includes(f.path));
    expect(violations(app, (spec) => !spec.startsWith('@/backends'))).toEqual([]);
  });

  it('the session store reaches backends only through the registry', () => {
    const importers = files.filter((f) => BACKEND_IMPORTERS.includes(f.path));
    expect(violations(importers, (spec) => !spec.startsWith('@/backends') || spec === '@/backends/registry')).toEqual([]);
  });

  it('no new Jellyfin SDK import outside the Jellyfin backend', () => {
    const app = files.filter((f) => !f.path.startsWith('backends/jellyfin/'));
    const importers = app.filter((f) => f.imports.some((spec) => spec.startsWith('@jellyfin/sdk'))).map((f) => f.path);
    expect(importers.sort()).toEqual([...LEGACY_SDK_IMPORTERS].sort());
  });
});
