import type { Database } from 'sql.js';
import type { CheckConstraint, ColumnMeta, ColumnVisibility, DatabaseMetadata, ForeignKeyMeta, IndexMeta, TableKind, TableMeta, TypeAffinity } from '@/types/database';
import { parseCreateTable, referencedColumns } from '@/lib/schema/schemaParser';
import type { ParsedCreateTable } from '@/lib/schema/schemaTypes';
import { quoteIdentifier } from '@/lib/schema/identifierUtils';
import { num, queryAll, queryScalar, readForeignKeys, readIndexInfo, readIndexList, readSchemaRows, readTableList, readTableXInfo, str } from '@/lib/sqlite/sqliteMetadata';
import { SEED_LIMITS } from '@/lib/limits';

/** SQLite's documented type-affinity rules (section 3.1 of the datatype docs). */
export function typeAffinity(declared: string): TypeAffinity {
  const t = declared.toUpperCase();
  if (t.includes('INT')) return 'INTEGER';
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return 'TEXT';
  if (t.includes('BLOB') || t.trim() === '') return 'BLOB';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'REAL';
  return 'NUMERIC';
}

const VISIBILITY: Record<number, ColumnVisibility> = { 0: 'normal', 1: 'hidden', 2: 'generated-virtual', 3: 'generated-stored' };

function safeParse(sql: string | null): { parsed: ParsedCreateTable | null; warning: string | null } {
  if (!sql) return { parsed: null, warning: null };
  try {
    return { parsed: parseCreateTable(sql), warning: null };
  } catch (e) {
    return { parsed: null, warning: `Schema inspector could not parse the stored DDL (${e instanceof Error ? e.message : 'unknown'}); CHECK hints unavailable, SQLite metadata still used.` };
  }
}

function buildColumns(db: Database, name: string, withoutRowid: boolean, parsed: ParsedCreateTable | null): ColumnMeta[] {
  const rows = readTableXInfo(db, name);
  const pkCount = rows.filter((r) => num(r.pk) > 0).length;
  return rows.map((r) => {
    const colName = str(r.name);
    const declaredType = str(r.type);
    const pk = num(r.pk);
    const parsedCol = parsed?.columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
    const isRowidAlias = !withoutRowid && pk === 1 && pkCount === 1 && declaredType.trim().toUpperCase() === 'INTEGER';
    return {
      cid: num(r.cid),
      name: colName,
      declaredType,
      affinity: typeAffinity(declaredType),
      notNull: num(r.notnull) === 1,
      defaultValue: r.dflt_value === null || r.dflt_value === undefined ? null : str(r.dflt_value),
      primaryKeyPosition: pk,
      visibility: VISIBILITY[num(r.hidden)] ?? 'normal',
      isRowidAlias,
      autoIncrement: Boolean(parsedCol?.autoIncrement),
    };
  });
}

function buildIndexes(db: Database, table: string): IndexMeta[] {
  return readIndexList(db, table).map((r) => {
    const name = str(r.name);
    const origin = str(r.origin);
    return {
      name,
      unique: num(r.unique) === 1,
      origin: origin === 'u' || origin === 'pk' ? origin : 'c',
      partial: num(r.partial) === 1,
      columns: readIndexInfo(db, name).map((c) => (c.name === null ? null : str(c.name))),
    };
  });
}

function buildChecks(parsed: ParsedCreateTable | null, columnNames: string[]): CheckConstraint[] {
  if (!parsed) return [];
  const out: CheckConstraint[] = [];
  for (const c of parsed.columns) for (const expression of c.checks) out.push({ expression, scope: 'column', columns: referencedColumns(expression, columnNames) });
  for (const c of parsed.constraints) if (c.kind === 'check') out.push({ expression: c.expression, scope: 'table', columns: referencedColumns(c.expression, columnNames) });
  return out;
}

function buildForeignKeys(db: Database, table: string, pkOf: (t: string) => string[] | null): ForeignKeyMeta[] {
  const grouped = new Map<number, ReturnType<typeof readForeignKeys>>();
  for (const r of readForeignKeys(db, table)) {
    const id = num(r.id);
    grouped.set(id, [...(grouped.get(id) ?? []), r]);
  }
  return [...grouped.entries()].map(([id, rows]) => {
    const first = rows[0];
    const toTable = str(first?.table);
    const parentPk = pkOf(toTable);
    const implied = rows.some((r) => r.to === null);
    return {
      id,
      fromTable: table,
      toTable,
      mappings: rows.map((r, idx) => ({ from: str(r.from), to: r.to === null ? (parentPk?.[idx] ?? 'rowid') : str(r.to) })),
      onUpdate: str(first?.on_update),
      onDelete: str(first?.on_delete),
      match: str(first?.match),
      impliedParentColumns: implied,
      parentExists: parentPk !== null,
    };
  });
}

function seedability(kind: TableKind, columns: ColumnMeta[]): string | null {
  if (kind === 'virtual') return 'Virtual table: rows depend on the module implementation, so it is not seeded automatically.';
  if (kind === 'shadow') return 'Internal shadow table of a virtual table.';
  if (columns.length > SEED_LIMITS.maxColumnsPerTable) return `Has ${columns.length} columns (limit ${SEED_LIMITS.maxColumnsPerTable}).`;
  return null;
}

/** Inspects the live database. SQLite metadata is authoritative; parsed DDL only adds CHECK/AUTOINCREMENT hints. */
export function inspectDatabase(db: Database): DatabaseMetadata {
  const t0 = performance.now();
  const schemaRows = readSchemaRows(db);
  const creationOrder = (name: string): number => schemaRows.findIndex((r) => str(r.name) === name);
  const list = readTableList(db)
    .filter((t) => t.type !== 'view')
    .sort((a, b) => creationOrder(a.name) - creationOrder(b.name));
  const sqlOf = (type: string, name: string): string | null => {
    const row = schemaRows.find((r) => str(r.type) === type && str(r.name) === name);
    return row && row.sql !== null ? str(row.sql) : null;
  };
  const pkCache = new Map<string, string[] | null>();
  const pkOf = (t: string): string[] | null => {
    const key = t.toLowerCase();
    if (!pkCache.has(key)) {
      const entry = list.find((x) => x.name.toLowerCase() === key);
      pkCache.set(key, entry ? readTableXInfo(db, entry.name).filter((r) => num(r.pk) > 0).sort((a, b) => num(a.pk) - num(b.pk)).map((r) => str(r.name)) : null);
    }
    return pkCache.get(key) ?? null;
  };
  const tables: TableMeta[] = list.map((t) => {
    const sql = sqlOf('table', t.name);
    const kind: TableKind = t.type === 'virtual' ? 'virtual' : t.type === 'shadow' ? 'shadow' : 'table';
    const { parsed, warning } = kind === 'table' ? safeParse(sql) : { parsed: null, warning: null };
    const columns = buildColumns(db, t.name, t.withoutRowid, parsed);
    const primaryKey = columns.filter((c) => c.primaryKeyPosition > 0).sort((a, b) => a.primaryKeyPosition - b.primaryKeyPosition).map((c) => c.name);
    const indexes = kind === 'table' ? buildIndexes(db, t.name) : [];
    const uniqueKeys = dedupeKeys([primaryKey, ...indexes.filter((i) => i.unique && !i.partial && i.columns.every((c) => c !== null)).map((i) => i.columns as string[])]);
    const skipReason = seedability(kind, columns);
    return {
      name: t.name,
      kind,
      withoutRowid: t.withoutRowid,
      strict: t.strict,
      sql,
      columns,
      primaryKey,
      uniqueKeys,
      checks: buildChecks(parsed, columns.map((c) => c.name)),
      foreignKeys: kind === 'table' ? buildForeignKeys(db, t.name, pkOf) : [],
      indexes,
      rowCount: kind === 'virtual' ? null : num(queryScalar(db, `SELECT COUNT(*) FROM ${quoteIdentifier(t.name)}`)),
      seedable: skipReason === null,
      skipReason,
      parseWarnings: [...(warning ? [warning] : []), ...(parsed?.warnings ?? [])],
    };
  });
  const views = schemaRows.filter((r) => str(r.type) === 'view').map((r) => ({
    name: str(r.name),
    sql: r.sql === null ? null : str(r.sql),
    columns: queryAll(db, 'SELECT name FROM pragma_table_info(?)', [str(r.name)]).map((c) => str(c.name)),
  }));
  const triggers = schemaRows.filter((r) => str(r.type) === 'trigger').map((r) => ({ name: str(r.name), table: str(r.tbl_name), sql: r.sql === null ? null : str(r.sql) }));
  return {
    sqliteVersion: str(queryScalar(db, 'SELECT sqlite_version()')),
    tables,
    views,
    triggers,
    relationships: tables.flatMap((t) => t.foreignKeys),
    schemaVersion: num(queryScalar(db, 'PRAGMA schema_version')),
    foreignKeysEnabled: num(queryScalar(db, 'PRAGMA foreign_keys')) === 1,
    inspectionMs: performance.now() - t0,
  };
}

function dedupeKeys(keys: string[][]): string[][] {
  const seen = new Set<string>();
  return keys.filter((k) => {
    const id = k.map((c) => c.toLowerCase()).sort().join('\u0000');
    if (k.length === 0 || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
