export type CopyResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Copies text with the async Clipboard API; reports failure instead of pretending success. */
export async function copyText(text: string): Promise<CopyResult> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return { ok: false, reason: 'Clipboard access is unavailable in this context (requires HTTPS or localhost).' };
  }
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.message ? e.message : 'The browser denied clipboard access.' };
  }
}
