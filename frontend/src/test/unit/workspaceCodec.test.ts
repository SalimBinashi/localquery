import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { decodeWorkspace, encodeWorkspace, HASH_PREFIX } from '@/lib/sharing/workspaceCodec';
import { buildShareUrl } from '@/lib/sharing/UrlState';
import { defaultWorkspace } from '@/lib/defaults';
import { URL_LIMITS } from '@/lib/limits';
import type { PlaygroundState } from '@/types/workspace';

const loc = { origin: 'https://example.github.io', pathname: '/playground/', search: '' };

describe('workspace codec', () => {
  it('round-trips state including the query and seed configuration', () => {
    const state: PlaygroundState = { ...defaultWorkspace(1234), currentQuery: 'SELECT 42;', seedConfig: { enabled: true, rowsPerTable: 10, randomSeed: 1234, locale: 'de' } };
    const hash = encodeWorkspace(state);
    expect(hash.startsWith(HASH_PREFIX)).toBe(true);
    expect(/^[A-Za-z0-9+\-$.]*$/.test(hash)).toBe(true);
    const r = decodeWorkspace(`#${hash}`);
    expect(r).toEqual({ status: 'ok', state });
  });
  it('preserves Unicode identifiers and text', () => {
    const state = { ...defaultWorkspace(), schema: 'CREATE TABLE "ユーザー" ("名前" TEXT, emoji TEXT DEFAULT \'🚀\');', currentQuery: "SELECT 'Ωmega — ✓' AS \"列\";" };
    const r = decodeWorkspace(encodeWorkspace(state));
    expect(r.status === 'ok' && r.state.schema).toBe(state.schema);
    expect(r.status === 'ok' && r.state.currentQuery).toBe(state.currentQuery);
  });
  it('compresses meaningfully compared with raw JSON', () => {
    const json = JSON.stringify(defaultWorkspace());
    const base64Length = Math.ceil(new TextEncoder().encode(json).length / 3) * 4;
    const encoded = encodeWorkspace(defaultWorkspace());
    expect(encoded.length).toBeLessThan(json.length);
    expect(encoded.length).toBeLessThan(base64Length * 0.7);
  });
  it('handles empty, foreign, corrupt and invalid payloads without throwing', () => {
    expect(decodeWorkspace('')).toEqual({ status: 'empty' });
    expect(decodeWorkspace('#')).toEqual({ status: 'empty' });
    expect(decodeWorkspace('#section-2').status).toBe('invalid');
    expect(decodeWorkspace('#ws9.abc')).toMatchObject({ status: 'invalid', reason: expect.stringMatching(/version 9/) });
    expect(decodeWorkspace(`#${HASH_PREFIX}%%%`).status).toBe('invalid');
    expect(decodeWorkspace(`#${HASH_PREFIX}NoTrEaLlY`).status).toBe('invalid');
    expect(decodeWorkspace(`#${HASH_PREFIX}${compressToEncodedURIComponent('{not json')}`)).toMatchObject({ reason: expect.stringMatching(/JSON/) });
    expect(decodeWorkspace(`#${HASH_PREFIX}${compressToEncodedURIComponent(JSON.stringify({ version: 1, schema: 'x' }))}`)).toMatchObject({ reason: expect.stringMatching(/currentQuery/) });
    expect(decodeWorkspace(`#${HASH_PREFIX}${compressToEncodedURIComponent(JSON.stringify({ ...defaultWorkspace(), version: 2 }))}`)).toMatchObject({ reason: expect.stringMatching(/Unsupported workspace version/) });
    const badDensity = { ...defaultWorkspace(), seedConfig: { ...defaultWorkspace().seedConfig, rowsPerTable: 1000 } };
    expect(decodeWorkspace(`#${HASH_PREFIX}${compressToEncodedURIComponent(JSON.stringify(badDensity))}`)).toMatchObject({ reason: expect.stringMatching(/10, 50 or 100/) });
    const badLocale = { ...defaultWorkspace(), seedConfig: { ...defaultWorkspace().seedConfig, locale: 'xx' } };
    expect(decodeWorkspace(`#${HASH_PREFIX}${compressToEncodedURIComponent(JSON.stringify(badLocale))}`).status).toBe('invalid');
    const badSeed = { ...defaultWorkspace(), seedConfig: { ...defaultWorkspace().seedConfig, randomSeed: -1 } };
    expect(decodeWorkspace(`#${HASH_PREFIX}${compressToEncodedURIComponent(JSON.stringify(badSeed))}`).status).toBe('invalid');
  });
  it('rejects oversized payloads before and after decompression', () => {
    expect(decodeWorkspace(`#${HASH_PREFIX}${'A'.repeat(URL_LIMITS.maxHashLength + 1)}`)).toMatchObject({ reason: expect.stringMatching(/too long/) });
    const huge = { ...defaultWorkspace(), schema: 'x'.repeat(URL_LIMITS.maxSchemaChars + 1) };
    expect(decodeWorkspace(`#${HASH_PREFIX}${compressToEncodedURIComponent(JSON.stringify(huge))}`).status).toBe('invalid');
    expect(() => encodeWorkspace(huge)).toThrow(/Cannot share/);
  });
  it('builds share URLs under the static base path and flags length', () => {
    const s = buildShareUrl(defaultWorkspace(), loc);
    expect(s.url.startsWith('https://example.github.io/playground/#ws1.')).toBe(true);
    expect(s.tooLong).toBe(false);
    const big = buildShareUrl({ ...defaultWorkspace(), schema: Array.from({ length: 4000 }, (_, i) => `-- ${Math.sin(i)}`).join('\n') }, loc);
    expect(big.tooLong).toBe(true);
  });
  it('drops unknown fields so URLs cannot smuggle extra state', () => {
    const r = decodeWorkspace(`#${HASH_PREFIX}${compressToEncodedURIComponent(JSON.stringify({ ...defaultWorkspace(), evil: '<script>' }))}`);
    expect(r.status === 'ok' && 'evil' in r.state).toBe(false);
  });
});
