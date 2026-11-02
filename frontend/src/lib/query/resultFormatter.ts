import type { SQLiteValue } from '@/types/database';

export type CellKind = 'null' | 'integer' | 'real' | 'int64' | 'text' | 'blob';

export interface FormattedCell {
  readonly kind: CellKind;
  readonly display: string;
  readonly truncated: boolean;
}

export function cellKind(v: SQLiteValue): CellKind {
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'real';
  if (typeof v === 'string') return 'text';
  if (v instanceof Uint8Array) return 'blob';
  return 'int64';
}

export function blobHex(bytes: Uint8Array, maxBytes = Infinity): string {
  return Array.from(bytes.subarray(0, Math.min(bytes.length, maxBytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Display formatting only; never used for copy/export (see toExportText). */
export function formatCell(v: SQLiteValue, maxChars: number): FormattedCell {
  const kind = cellKind(v);
  if (v === null) return { kind, display: 'NULL', truncated: false };
  if (v instanceof Uint8Array) return { kind, display: `BLOB ${v.length} B · ${blobHex(v, 8)}${v.length > 8 ? '…' : ''}`, truncated: v.length > 8 };
  const text = typeof v === 'object' ? v.text : String(v);
  return text.length > maxChars ? { kind, display: `${text.slice(0, maxChars)}…`, truncated: true } : { kind, display: text, truncated: false };
}

/** Exact textual value. NULL → null so callers decide its representation. BLOB → \x-prefixed hex. */
export function toExportText(v: SQLiteValue): string | null {
  if (v === null) return null;
  if (v instanceof Uint8Array) return `\\x${blobHex(v)}`;
  if (typeof v === 'object') return v.text;
  return String(v);
}

/** RFC 4180 CSV. NULL is an empty unquoted field; empty strings are quoted ("") so the two stay distinct. */
export function toCsv(columns: readonly string[], rows: readonly (readonly SQLiteValue[])[]): string {
  const esc = (s: string): string => `"${s.replace(/"/g, '""')}"`;
  const field = (v: SQLiteValue): string => {
    const t = toExportText(v);
    if (t === null) return '';
    return t === '' || /[",\r\n]/.test(t) || /^\s|\s$/.test(t) ? esc(t) : t;
  };
  return [columns.map((c) => (/[",\r\n]/.test(c) ? esc(c) : c)).join(','), ...rows.map((r) => r.map(field).join(','))].join('\r\n');
}

/** Tab-separated text for clipboard; NULL rendered as the bare token NULL. */
export function toTsv(columns: readonly string[], rows: readonly (readonly SQLiteValue[])[]): string {
  const clean = (s: string): string => s.replace(/[\t\r\n]/g, ' ');
  return [columns.map(clean).join('\t'), ...rows.map((r) => r.map((v) => clean(toExportText(v) ?? 'NULL')).join('\t'))].join('\n');
}
