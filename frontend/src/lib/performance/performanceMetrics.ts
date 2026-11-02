/** Formats a measured duration; never invents values. */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1) return `${ms.toFixed(3)} ms`;
  if (ms < 100) return `${ms.toFixed(2)} ms`;
  if (ms < 10000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Round-trip minus worker-measured execution = messaging + structured-clone transfer overhead. */
export function transferOverhead(roundTripMs: number, executionMs: number): number {
  return Math.max(0, roundTripMs - executionMs);
}
