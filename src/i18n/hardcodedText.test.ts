import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

const SRC = resolve(__dirname, '..');
// Brand names and units that stay the same in every language.
const ALLOWED = /^(Vela|AirPlay|Cast|kbps|fps|·|\/)$/;

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'ui' ? [] : vueFiles(path);
    return name.endsWith('.vue') ? [path] : [];
  });
}

/** Visible text nodes in a template (mustaches and comments removed). */
function templateText(src: string): string[] {
  const tpl = (src.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '');
  return [...tpl.matchAll(/>([^<>]+)</g)]
    .map((m) => m[1].trim())
    .filter((t) => /[A-Za-zÀ-ÿ]{3,}/.test(t) && !/[=?:]|&&|\|\|/.test(t) && !ALLOWED.test(t)); // attribute expressions containing '>' are not text
}

/** English sentences in script string literals (logs and thrown errors excluded). */
function scriptSentences(src: string): string[] {
  const script = src.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
  return script
    .split('\n')
    .filter((line) => !/logger\.|console\.|debugLog|throw new Error/.test(line))
    .flatMap((line) => [...line.matchAll(/['`]([A-Z][a-z]+(?: [a-z]+){2,}[^'`]*)['`]/g)].map((m) => m[1]));
}

describe('no hardcoded UI text', () => {
  it('routes every visible string in .vue files through i18n', () => {
    const offenders = vueFiles(SRC).flatMap((file) => {
      const src = readFileSync(file, 'utf8');
      return [...templateText(src), ...scriptSentences(src)].map((t) => `${file.replace(SRC, 'src')}: ${t}`);
    });
    expect(offenders).toEqual([]);
  });
});
