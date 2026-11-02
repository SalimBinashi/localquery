/** Triggers a local download; nothing is uploaded. */
export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampedName(base: string, ext: string): string {
  return `${base}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
}
