/** Quotes any string as a SQLite identifier: wraps in double quotes and doubles embedded quotes. */
export function quoteIdentifier(name: string): string {
  if (name.includes('\u0000')) throw new Error('Identifiers cannot contain NUL characters');
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteQualified(schema: string | null, name: string): string {
  return schema ? `${quoteIdentifier(schema)}.${quoteIdentifier(name)}` : quoteIdentifier(name);
}

/** Lower-cased, snake_case form used for semantic column matching (camelCase → camel_case). */
export function normalizeIdentifier(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function sameIdentifier(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Renders a SQL literal for script export only (never used for generated inserts). */
export function sqlLiteral(value: null | string | number | bigint | Uint8Array): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) {
    return `X'${Array.from(value, (b) => b.toString(16).padStart(2, '0')).join('')}'`;
  }
  return `'${value.replace(/'/g, "''")}'`;
}
