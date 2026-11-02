import type { Database, SqlJsStatic, SqlValue, Statement } from 'sql.js';
import type { DatabaseMetadata, SQLiteValue, StorageClass } from '@/types/database';
import type { QueryExecutionResult, ResultLimits, SQLiteColumn, StatementResult } from '@/types/query';
import type { SeedConfig } from '@/types/workspace';
import type { ImportResult, SchemaExecutionResult, SchemaStatementOutcome, WorkerProgress } from '@/lib/sqlite/sqliteTypes';
import type { SeedRecord, SeedReport, SeedResult } from '@/lib/seeding/seedTypes';
import { EngineError, engineError, normalizeError } from '@/lib/sqlite/sqliteErrors';
import { inspectDatabase } from '@/lib/schema/schemaInspector';
import { generateSeedData } from '@/lib/seeding/MockDataGenerator';
import { classifyStatement, isDmlStatement } from '@/lib/query/queryClassifier';
import { splitStatements } from '@/lib/query/sqlStatementSplitter';
import { lineColumnAt, tokenize } from '@/lib/schema/sqlTokenizer';
import { quoteIdentifier, sqlLiteral } from '@/lib/schema/identifierUtils';
import { num, queryAll, queryScalar, str } from '@/lib/sqlite/sqliteMetadata';
import { INPUT_LIMITS } from '@/lib/limits';

type ProgressFn = (phase: WorkerProgress['phase'], detail: string) => void;
type RawValue = SqlValue | bigint;

const SQLITE_HEADER = 'SQLite format 3\u0000';

export function toSQLiteValue(v: RawValue): SQLiteValue {
  if (typeof v === 'bigint') return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : { kind: 'int64', text: v.toString() };
  return v;
}

/** sql.js >= 1.10 supports get(params, { useBigInt }); @types/sql.js omits the second parameter. */
type BigIntGetter = (params: null, config: { useBigInt: boolean }) => RawValue[];
function readRow(stmt: Statement): RawValue[] {
  return (stmt.get as unknown as BigIntGetter).call(stmt, null, { useBigInt: true });
}

function storageOf(v: RawValue): StorageClass {
  if (v === null) return 'null';
  if (typeof v === 'bigint') return 'integer';
  if (typeof v === 'number') return 'real'; // integers arrive as bigint with useBigInt
  if (typeof v === 'string') return 'text';
  return 'blob';
}

function sizeOf(v: RawValue): number {
  if (typeof v === 'string') return v.length * 2;
  if (v instanceof Uint8Array) return v.byteLength;
  return 8;
}

interface RunOptions {
  readonly retainRows: boolean;
  readonly limits: ResultLimits;
  readonly phase: 'schema' | 'query';
}

interface RunOutcome {
  readonly statements: StatementResult[];
  readonly error: ReturnType<typeof normalizeError> | null;
  readonly skipped: number;
}

/** Executes every statement through sql.js' prepared-statement iterator (trigger bodies stay intact). */
function runStatements(db: Database, sql: string, opts: RunOptions): RunOutcome {
  const statements: StatementResult[] = [];
  const it = db.iterateStatements(sql);
  let payload = 0;
  for (;;) {
    const remaining = it.getRemainingSQL();
    const offset = sql.length - remaining.length + (remaining.length - remaining.trimStart().length);
    const pos = lineColumnAt(sql, offset);
    let stmt: ReturnType<typeof it.next>['value'] | undefined;
    try {
      const n = it.next();
      if (n.done) break;
      stmt = n.value;
    } catch (e) {
      const failing = safeFirstStatement(remaining);
      return { statements, error: normalizeError(e, { phase: opts.phase, statement: failing, statementIndex: statements.length, line: pos.line, column: pos.column }), skipped: Math.max(0, safeCount(remaining) - 1) };
    }
    if (statements.length >= opts.limits.maxStatements) {
      stmt.free();
      return { statements, error: { category: 'resource', message: `More than ${opts.limits.maxStatements} statements in one execution.`, phase: opts.phase, recoverable: true }, skipped: safeCount(remaining) };
    }
    const text = (stmt.getSQL() ?? '').trim();
    const statementType = classifyStatement(text);
    const t0 = performance.now();
    try {
      const names = stmt.getColumnNames();
      const rows: SQLiteValue[][] = [];
      const observed = names.map(() => new Set<StorageClass>());
      let rowCount = 0;
      let truncated = false;
      while (stmt.step()) {
        rowCount++;
        if (!opts.retainRows) continue;
        if (rows.length >= opts.limits.maxRetainedRows || payload >= opts.limits.maxPayloadBytes) {
          truncated = true;
          continue;
        }
        const raw = readRow(stmt);
        raw.forEach((v, i) => {
          observed[i]?.add(storageOf(v));
          payload += sizeOf(v);
        });
        rows.push(raw.map(toSQLiteValue));
      }
      const executionMs = performance.now() - t0;
      const columns: SQLiteColumn[] = names.map((name, i) => {
        const classes = [...(observed[i] ?? [])].filter((c) => c !== 'null');
        return { name, declaredType: null, valueType: classes.length === 0 ? 'unknown' : classes.length === 1 ? (classes[0] as StorageClass) : 'mixed', containsNull: observed[i]?.has('null') ?? false };
      });
      statements.push({ index: statements.length, sql: text, line: pos.line, statementType, returnsRows: names.length > 0, columns, rows, rowCount, retainedRowCount: rows.length, truncated, changes: isDmlStatement(statementType) ? db.getRowsModified() : null, executionMs });
    } catch (e) {
      stmt.free();
      return { statements, error: normalizeError(e, { phase: opts.phase, statement: text, statementIndex: statements.length, line: pos.line, column: pos.column }), skipped: Math.max(0, safeCount(it.getRemainingSQL())) };
    }
  }
  return { statements, error: null, skipped: 0 };
}

function safeFirstStatement(sql: string): string {
  try {
    return splitStatements(sql)[0]?.text ?? sql.slice(0, 500);
  } catch {
    return sql.slice(0, 500);
  }
}

function safeCount(sql: string): number {
  try {
    return splitStatements(sql).length;
  } catch {
    return 0;
  }
}

/** Detects an open transaction (sql.js does not export sqlite3_get_autocommit). */
export function isInTransaction(db: Database): boolean {
  try {
    db.run('BEGIN');
  } catch {
    return true;
  }
  db.run('ROLLBACK');
  return false;
}

function hasExecutableSql(sql: string): boolean {
  try {
    return tokenize(sql).length > 0;
  } catch {
    return true; // let SQLite report the lexical error
  }
}

/** Worker-side SQLite engine. The single owner of the live sql.js Database. */
export class SQLiteEngine {
  private db: Database | null = null;

  constructor(private readonly SQL: SqlJsStatic) {}

  initialize(): void {
    this.db?.close();
    this.db = this.createDb();
  }

  private createDb(bytes?: Uint8Array): Database {
    const db = bytes ? new this.SQL.Database(bytes) : new this.SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    return db;
  }

  private get live(): Database {
    if (!this.db) throw engineError('initialization', 'The database is not initialized.', { phase: 'init' });
    return this.db;
  }

  get sqliteVersion(): string {
    return str(queryScalar(this.live, 'SELECT sqlite_version()'));
  }

  /** Builds the schema in a staging database; the live database is replaced only on full success. */
  executeSchema(ddl: string, seed: SeedConfig | null, progress: ProgressFn = () => undefined): SchemaExecutionResult {
    this.validateSql(ddl, INPUT_LIMITS.maxSchemaChars, 'schema');
    void this.live;
    const t0 = performance.now();
    const staging = this.createDb();
    try {
      progress('schema', 'Executing schema statements');
      const run = runStatements(staging, ddl, { retainRows: false, limits: { maxRetainedRows: 0, maxPayloadBytes: 0, maxStatements: 2000 }, phase: 'schema' });
      if (run.error) throw new EngineError({ ...run.error, phase: 'schema', hint: run.error.hint ?? 'The previous database was left unchanged.' });
      if (isInTransaction(staging)) throw engineError('validation', 'The schema script leaves a transaction open. Add COMMIT or remove BEGIN.', { phase: 'schema' });
      const schemaMs = performance.now() - t0;
      progress('inspect', 'Inspecting SQLite metadata');
      const i0 = performance.now();
      let metadata = inspectDatabase(staging);
      const inspectMs = performance.now() - i0;
      let seedReport: SeedReport | null = null;
      let seedMs: number | null = null;
      if (seed?.enabled) {
        progress('seed', `Generating ${seed.rowsPerTable} rows per eligible table`);
        const s0 = performance.now();
        seedReport = this.seedInSavepoint(staging, metadata, seed);
        seedMs = performance.now() - s0;
        metadata = inspectDatabase(staging);
      }
      const statements: SchemaStatementOutcome[] = run.statements.map((s) => ({ index: s.index, line: s.line, statementType: s.statementType, executionMs: s.executionMs }));
      this.db?.close();
      this.db = staging;
      return { statements, metadata, seedReport, timings: { schemaMs, inspectMs, seedMs, totalMs: performance.now() - t0 } };
    } catch (e) {
      staging.close();
      throw new EngineError(normalizeError(e, { phase: 'schema' }));
    }
  }

  private seedInSavepoint(db: Database, metadata: DatabaseMetadata, seed: SeedConfig): SeedReport {
    db.run('SAVEPOINT playground_seed');
    try {
      const report = generateSeedData(db, metadata, seed);
      db.run('RELEASE playground_seed');
      return report;
    } catch (e) {
      db.run('ROLLBACK TO playground_seed');
      db.run('RELEASE playground_seed');
      throw new EngineError(normalizeError(e, { phase: 'seed' }));
    }
  }

  /** Generates mock data into the live database (all-or-nothing). */
  generateSeed(seed: SeedConfig): { report: SeedReport; metadata: DatabaseMetadata } {
    const report = this.seedInSavepoint(this.live, inspectDatabase(this.live), seed);
    return { report, metadata: inspectDatabase(this.live) };
  }

  /** Inserts caller-provided records with a prepared statement; all-or-nothing. */
  seedData(table: string, records: readonly SeedRecord[]): SeedResult {
    const db = this.live;
    const t0 = performance.now();
    const meta = inspectDatabase(db).tables.find((t) => t.name.toLowerCase() === table.toLowerCase());
    if (!meta) throw engineError('validation', `Table "${table}" does not exist.`, { phase: 'seed' });
    const known = new Set(meta.columns.map((c) => c.name.toLowerCase()));
    db.run('SAVEPOINT playground_records');
    try {
      for (const record of records) {
        const cols = Object.keys(record);
        const unknown = cols.find((c) => !known.has(c.toLowerCase()));
        if (unknown) throw engineError('validation', `Column "${unknown}" does not exist in "${meta.name}".`, { phase: 'seed' });
        const sql = cols.length ? `INSERT INTO ${quoteIdentifier(meta.name)} (${cols.map(quoteIdentifier).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})` : `INSERT INTO ${quoteIdentifier(meta.name)} DEFAULT VALUES`;
        db.run(sql, cols.length ? cols.map((c) => record[c] ?? null) : undefined);
      }
      db.run('RELEASE playground_records');
      return { table: meta.name, inserted: records.length, durationMs: performance.now() - t0 };
    } catch (e) {
      db.run('ROLLBACK TO playground_records');
      db.run('RELEASE playground_records');
      throw new EngineError(normalizeError(e, { phase: 'seed' }));
    }
  }

  runQuery(sql: string, limits: ResultLimits): QueryExecutionResult {
    this.validateSql(sql, INPUT_LIMITS.maxQueryChars, 'query');
    const db = this.live;
    const schema0 = num(queryScalar(db, 'PRAGMA schema_version'));
    const changes0 = num(queryScalar(db, 'SELECT total_changes()'));
    const t0 = performance.now();
    const run = runStatements(db, sql, { retainRows: true, limits, phase: 'query' });
    const totalExecutionMs = performance.now() - t0;
    const schemaChanged = num(queryScalar(db, 'PRAGMA schema_version')) !== schema0;
    return {
      statements: run.statements,
      error: run.error,
      skippedStatements: run.skipped,
      totalExecutionMs,
      schemaChanged,
      dataChanged: num(queryScalar(db, 'SELECT total_changes()')) !== changes0,
      inTransaction: isInTransaction(db),
      metadata: schemaChanged ? inspectDatabase(db) : null,
    };
  }

  getSchemaMetadata(): DatabaseMetadata {
    return inspectDatabase(this.live);
  }

  resetDatabase(): DatabaseMetadata {
    this.initialize();
    return inspectDatabase(this.live);
  }

  exportDatabase(): Uint8Array {
    const db = this.live;
    if (isInTransaction(db)) throw engineError('execution', 'Commit or roll back the open transaction before exporting.', { phase: 'export' });
    const bytes = db.export();
    db.run('PRAGMA foreign_keys = ON'); // sql.js export() reopens the database and resets pragmas
    return bytes;
  }

  exportSqlDump(): string {
    const db = this.live;
    const objects = queryAll(db, "SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, rowid");
    const shadow = new Set(queryAll(db, "SELECT name FROM pragma_table_list WHERE type IN ('shadow','virtual')").map((r) => str(r.name)));
    const lines = ['-- SQL dump generated locally by Local-First SQLite Playground', 'PRAGMA foreign_keys = OFF;', 'BEGIN TRANSACTION;'];
    for (const o of objects) {
      if (shadow.has(str(o.name)) && !str(o.sql).toUpperCase().startsWith('CREATE VIRTUAL')) continue;
      lines.push(`${str(o.sql)};`);
      if (str(o.type) !== 'table' || shadow.has(str(o.name))) continue;
      const stmt = db.prepare(`SELECT * FROM ${quoteIdentifier(str(o.name))}`);
      try {
        const cols = stmt.getColumnNames().map(quoteIdentifier).join(', ');
        while (stmt.step()) {
          const values = readRow(stmt).map((v) => sqlLiteral(v));
          lines.push(`INSERT INTO ${quoteIdentifier(str(o.name))} (${cols}) VALUES (${values.join(', ')});`);
        }
      } finally {
        stmt.free();
      }
    }
    lines.push('COMMIT;', 'PRAGMA foreign_keys = ON;', '');
    return lines.join('\n');
  }

  importDatabase(bytes: Uint8Array): ImportResult {
    if (bytes.byteLength > INPUT_LIMITS.maxImportBytes) throw engineError('resource', `File exceeds ${INPUT_LIMITS.maxImportBytes / 1024 / 1024} MB import limit.`, { phase: 'import' });
    const header = new TextDecoder().decode(bytes.slice(0, 16));
    if (header !== SQLITE_HEADER) throw engineError('validation', 'The file is not a SQLite 3 database (invalid header).', { phase: 'import' });
    let staging: Database | null = null;
    try {
      staging = this.createDb(bytes);
      const check = queryAll(staging, 'PRAGMA quick_check').map((r) => str(Object.values(r)[0]));
      if (check.length !== 1 || check[0] !== 'ok') throw engineError('validation', `Integrity check failed: ${check.slice(0, 3).join('; ')}`, { phase: 'import' });
      const metadata = inspectDatabase(staging);
      const schemaSql = queryAll(staging, "SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY rowid").map((r) => `${str(r.sql)};`).join('\n\n');
      this.db?.close();
      this.db = staging;
      return { metadata, schemaSql };
    } catch (e) {
      staging?.close();
      throw new EngineError(normalizeError(e, { phase: 'import' }));
    }
  }

  dispose(): void {
    this.db?.close();
    this.db = null;
  }

  private validateSql(sql: string, max: number, phase: 'schema' | 'query'): void {
    if (typeof sql !== 'string' || !hasExecutableSql(sql)) throw engineError('validation', phase === 'schema' ? 'The schema is empty. Add at least one CREATE TABLE statement.' : 'The query is empty.', { phase });
    if (sql.length > max) throw engineError('resource', `Input exceeds ${max.toLocaleString()} characters.`, { phase });
  }
}
