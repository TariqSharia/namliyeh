// Every text the screens use must exist in both languages, and no translation may be empty.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('translations', () => {
  it('Arabic and English have the same keys, none empty', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of [...Object.entries(ar), ...Object.entries(en)]) expect(v.trim(), k).not.toBe('');
  });

  it('every t("key") in the screens exists', () => {
    const used = new Set<string>();
    for (const file of sourceFiles('src').filter((f) => !f.includes('i18n'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bt\('([a-zA-Z_]+)'/g)) used.add(m[1]!);
      for (const m of text.matchAll(/(?:titleKey|hintKey)="([a-zA-Z]+)"/g)) used.add(m[1]!);
    }
    const missing = [...used].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it('placeholders match between languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(vars(ar[k]), k).toEqual(vars(en[k]));
  });
});
