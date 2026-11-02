import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { PlaygroundState } from '@/types/workspace';
import { validateWorkspace } from '@/lib/sharing/workspaceValidation';
import { URL_LIMITS } from '@/lib/limits';

/** Hash format: "#ws1." + lz-string compressToEncodedURIComponent(JSON). */
export const HASH_PREFIX = 'ws1.';

export type DecodeResult =
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly state: PlaygroundState }
  | { readonly status: 'invalid'; readonly reason: string };

export function encodeWorkspace(state: PlaygroundState): string {
  const checked = validateWorkspace(state);
  if (!checked.ok) throw new Error(`Cannot share workspace: ${checked.reason}`);
  return HASH_PREFIX + compressToEncodedURIComponent(JSON.stringify(checked.state));
}

/** Decodes an untrusted hash. Never throws. */
export function decodeWorkspace(rawHash: string): DecodeResult {
  const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  if (hash.trim() === '') return { status: 'empty' };
  if (!hash.startsWith(HASH_PREFIX)) {
    const legacy = /^ws(\d+)\./.exec(hash);
    return { status: 'invalid', reason: legacy ? `Workspace format version ${legacy[1]} is not supported by this build.` : 'The link does not contain a recognised workspace.' };
  }
  const payload = hash.slice(HASH_PREFIX.length);
  if (payload.length > URL_LIMITS.maxHashLength) return { status: 'invalid', reason: `The workspace link is too long (${payload.length} > ${URL_LIMITS.maxHashLength} characters).` };
  if (!/^[A-Za-z0-9+\-$]*$/.test(payload)) return { status: 'invalid', reason: 'The workspace data contains invalid characters (the link may be truncated or altered).' };
  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(payload);
  } catch {
    json = null;
  }
  if (!json) return { status: 'invalid', reason: 'The workspace data could not be decompressed (corrupt or truncated link).' };
  if (json.length > URL_LIMITS.maxDecodedChars) return { status: 'invalid', reason: 'Decoded workspace exceeds the size limit.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { status: 'invalid', reason: 'The workspace data is not valid JSON.' };
  }
  const result = validateWorkspace(parsed);
  return result.ok ? { status: 'ok', state: result.state } : { status: 'invalid', reason: result.reason };
}
