import type { BindParams, Database, SqlValue } from 'sql.js';

export type Row = Record<string, SqlValue>;

/** Runs a read-only metadata query with bound parameters and returns plain objects. */
export function queryAll(db: Database, sql: string, params: BindParams = []): Row[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: Row[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

export function queryScalar(db: Database, sql: string, params: BindParams = []): SqlValue {
  const row = queryAll(db, sql, params)[0];
  return row ? (Object.values(row)[0] ?? null) : null;
}

export const str = (v: SqlValue | undefined): string => (v === null || v === undefined ? '' : String(v));
export const num = (v: SqlValue | undefined): number => (typeof v === 'number' ? v : Number(v ?? 0));

export interface RawTableListEntry {
  readonly name: string;
  readonly type: string;
  readonly withoutRowid: boolean;
  readonly strict: boolean;
}

export function readTableList(db: Database): RawTableListEntry[] {
  return queryAll(db, "SELECT name, type, wr, strict FROM pragma_table_list WHERE schema = 'main' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'").map((r) => ({
    name: str(r.name),
    type: str(r.type),
    withoutRowid: num(r.wr) === 1,
    strict: num(r.strict) === 1,
  }));
}

export function readSchemaRows(db: Database): Row[] {
  return queryAll(db, "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY rowid");
}

export const readTableXInfo = (db: Database, table: string): Row[] => queryAll(db, 'SELECT * FROM pragma_table_xinfo(?)', [table]);
export const readForeignKeys = (db: Database, table: string): Row[] => queryAll(db, 'SELECT * FROM pragma_foreign_key_list(?) ORDER BY id, seq', [table]);
export const readIndexList = (db: Database, table: string): Row[] => queryAll(db, 'SELECT * FROM pragma_index_list(?)', [table]);
export const readIndexInfo = (db: Database, index: string): Row[] => queryAll(db, 'SELECT * FROM pragma_index_info(?) ORDER BY seqno', [index]);
