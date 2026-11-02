import type { PlaygroundState } from '@/types/workspace';
import { decodeWorkspace, encodeWorkspace, type DecodeResult } from '@/lib/sharing/workspaceCodec';
import { URL_LIMITS } from '@/lib/limits';

export function serializeState(state: PlaygroundState): string {
  return encodeWorkspace(state);
}

export function deserializeState(hash: string = window.location.hash): PlaygroundState | null {
  const r = decodeWorkspace(hash);
  return r.status === 'ok' ? r.state : null;
}

export function readHash(hash: string = window.location.hash): DecodeResult {
  return decodeWorkspace(hash);
}

export interface ShareUrl {
  readonly url: string;
  readonly hash: string;
  readonly length: number;
  readonly tooLong: boolean;
  readonly nearLimit: boolean;
}

export function buildShareUrl(state: PlaygroundState, location: Pick<Location, 'origin' | 'pathname' | 'search'> = window.location): ShareUrl {
  const hash = `#${serializeState(state)}`;
  const url = `${location.origin}${location.pathname}${location.search}${hash}`;
  return { url, hash, length: url.length, tooLong: url.length > URL_LIMITS.maxUrlLength, nearLimit: url.length > URL_LIMITS.warnUrlLength };
}

/** Pushes a history entry (so Back/Forward work) without reloading or firing a reload. */
export function writeHash(hash: string): void {
  if (window.location.hash === hash) return;
  window.history.pushState(null, '', hash);
}

export function clearHash(): void {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}
