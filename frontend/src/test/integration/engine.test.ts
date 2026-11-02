import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '@/test/fixtures/engine';
import { DEFAULT_QUERY, DEFAULT_SCHEMA, EXAMPLE_QUERIES } from '@/lib/defaults';
import type { SQLiteEngine } from '@/lib/sqlite/SQLiteEngine';
import type { SeedConfig } from '@/types/workspace';
import { EngineError } from '@/lib/sqlite/sqliteErrors';
import { RESULT_LIMITS } from '@/lib/limits';

const seed = (rows: 10 | 50 | 100 = 10, randomSeed = 7): SeedConfig => ({ enabled: true, rowsPerTable: rows, randomSeed, locale: 'en' });

describe('SQLiteEngine (real sql.js WASM)', () => {
  let engine: SQLiteEngine;
  beforeEach(async () => {
    engine = await createEngine();
  });

  it('initializes a real SQLite engine', () => {
    expect(engine.sqliteVersion).toMatch(/^3\.\d+/);
  });

  it('applies the default schema, seeds it and keeps foreign keys valid', () => {
    const r = engine.executeSchema(DEFAULT_SCHEMA, seed(50));
    expect(r.metadata.tables.map((t) => t.name)).toEqual(['users', 'products', 'orders', 'order_items']);
    expect(r.seedReport?.totalInserted).toBeGreaterThan(150);
    for (const t of r.seedReport?.tables ?? []) expect(t.inserted).toBe(50);
    const fk = engine.runQuery('PRAGMA foreign_key_check', RESULT_LIMITS);
    expect(fk.statements[0]?.rowCount).toBe(0);
    const orphans = engine.runQuery('SELECT COUNT(*) FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE u.id IS NULL', RESULT_LIMITS);
    expect(orphans.statements[0]?.rows[0]?.[0]).toBe(0);
    const q = engine.runQuery(DEFAULT_QUERY, RESULT_LIMITS);
    expect(q.error).toBeNull();
    expect(q.statements[0]?.columns.map((c) => c.name)).toEqual(['id', 'customer', 'orders', 'revenue']);
  });

  it('runs every example query against the default dataset', () => {
    engine.executeSchema(DEFAULT_SCHEMA, seed(10));
    for (const ex of EXAMPLE_QUERIES) {
      const r = engine.runQuery(ex.sql, RESULT_LIMITS);
      expect(r.error, ex.label).toBeNull();
    }
  });

  it('is deterministic for the same seed', () => {
    engine.executeSchema(DEFAULT_SCHEMA, seed(10, 99));
    const a = engine.runQuery('SELECT * FROM users ORDER BY id; SELECT * FROM order_items ORDER BY 1, 2', RESULT_LIMITS);
    engine.executeSchema(DEFAULT_SCHEMA, seed(10, 99));
    const b = engine.runQuery('SELECT * FROM users ORDER BY id; SELECT * FROM order_items ORDER BY 1, 2', RESULT_LIMITS);
    expect(b.statements.map((s) => s.rows)).toEqual(a.statements.map((s) => s.rows));
    engine.executeSchema(DEFAULT_SCHEMA, seed(10, 100));
    const c = engine.runQuery('SELECT * FROM users ORDER BY id', RESULT_LIMITS);
    expect(c.statements[0]?.rows).not.toEqual(a.statements[0]?.rows);
  });

  it('keeps the previous database when a schema rebuild fails', () => {
    engine.executeSchema(DEFAULT_SCHEMA, seed(10));
    expect(() => engine.executeSchema('CREATE TABLE ok(id INTEGER);\nCREATE TABLE broken (id INTEGER,, x);', null)).toThrow(EngineError);
    const r = engine.runQuery('SELECT COUNT(*) FROM users', RESULT_LIMITS);
    expect(r.statements[0]?.rows[0]?.[0]).toBe(10);
  });

  it('reports structured errors with statement position', () => {
    engine.executeSchema(DEFAULT_SCHEMA, null);
    const r = engine.runQuery('SELECT 1;\nSELEC * FROM users;\nSELECT 2;', RESULT_LIMITS);
    expect(r.statements).toHaveLength(1);
    expect(r.error?.category).toBe('syntax');
    expect(r.error?.line).toBe(2);
    expect(r.skippedStatements).toBe(1);
    const missing = engine.runQuery('SELECT * FROM nope', RESULT_LIMITS);
    expect(missing.error?.category).toBe('schema');
    const fk = engine.runQuery('INSERT INTO orders (user_id, status, created_at) VALUES (999, \'paid\', \'x\')', RESULT_LIMITS);
    expect(fk.error?.code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
    const chk = engine.runQuery("INSERT INTO products (sku, name, price, created_at) VALUES ('a', 'b', -1, 'x')", RESULT_LIMITS);
    expect(chk.error?.code).toBe('SQLITE_CONSTRAINT_CHECK');
  });

  it('handles mutations, RETURNING, zero rows, DDL refresh and transactions', () => {
    engine.executeSchema(DEFAULT_SCHEMA, seed(10));
    const ins = engine.runQuery("INSERT INTO users (email, first_name, last_name) VALUES ('z@example.com','Z','Z') RETURNING id", RESULT_LIMITS);
    expect(ins.statements[0]?.returnsRows).toBe(true);
    expect(ins.statements[0]?.changes).toBe(1);
    expect(ins.dataChanged).toBe(true);
    const upd = engine.runQuery("UPDATE users SET phone = NULL WHERE email = 'z@example.com'", RESULT_LIMITS);
    expect(upd.statements[0]?.changes).toBe(1);
    expect(upd.statements[0]?.returnsRows).toBe(false);
    const del = engine.runQuery("DELETE FROM users WHERE email = 'z@example.com'", RESULT_LIMITS);
    expect(del.statements[0]?.changes).toBe(1);
    const none = engine.runQuery('SELECT * FROM users WHERE 0', RESULT_LIMITS);
    expect(none.error).toBeNull();
    expect(none.statements[0]?.rowCount).toBe(0);
    expect(none.statements[0]?.columns.length).toBeGreaterThan(0);
    const ddl = engine.runQuery('CREATE TABLE tags (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id))', RESULT_LIMITS);
    expect(ddl.schemaChanged).toBe(true);
    expect(ddl.metadata?.tables.some((t) => t.name === 'tags')).toBe(true);
    const tx = engine.runQuery('BEGIN; DELETE FROM order_items;', RESULT_LIMITS);
    expect(tx.inTransaction).toBe(true);
    engine.runQuery('ROLLBACK', RESULT_LIMITS);
    expect(engine.runQuery('SELECT COUNT(*) FROM order_items', RESULT_LIMITS).statements[0]?.rows[0]?.[0]).toBeGreaterThan(0);
  });

  it('truncates large results but reports the true row count', () => {
    const r = engine.runQuery('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x < 12000) SELECT x FROM n', RESULT_LIMITS);
    expect(r.statements[0]?.rowCount).toBe(12000);
    expect(r.statements[0]?.retainedRowCount).toBe(RESULT_LIMITS.maxRetainedRows);
    expect(r.statements[0]?.truncated).toBe(true);
  });

  it('represents BLOBs as bytes and unsafe 64-bit integers as exact text', () => {
    const r = engine.runQuery("SELECT x'00ff10' AS b, 9223372036854775807 AS big, 42 AS small, 1.5 AS real, NULL AS n", RESULT_LIMITS);
    const row = r.statements[0]?.rows[0];
    expect(row?.[0]).toBeInstanceOf(Uint8Array);
    expect(Array.from(row?.[0] as Uint8Array)).toEqual([0, 255, 16]);
    expect(row?.[1]).toEqual({ kind: 'int64', text: '9223372036854775807' });
    expect(row?.[2]).toBe(42);
    expect(row?.[3]).toBe(1.5);
    expect(row?.[4]).toBeNull();
  });

  it('reset creates a fresh empty database; export/import round-trips', () => {
    engine.executeSchema(DEFAULT_SCHEMA, seed(10));
    const bytes = engine.exportDatabase();
    expect(engine.getSchemaMetadata().foreignKeysEnabled).toBe(true);
    const meta = engine.resetDatabase();
    expect(meta.tables).toHaveLength(0);
    const imported = engine.importDatabase(bytes);
    expect(imported.metadata.tables.find((t) => t.name === 'users')?.rowCount).toBe(10);
    expect(imported.schemaSql).toContain('CREATE TABLE users');
    expect(() => engine.importDatabase(new Uint8Array([1, 2, 3]))).toThrow(/not a SQLite/);
    const dump = engine.exportSqlDump();
    const fresh = engine.resetDatabase();
    expect(fresh.tables).toHaveLength(0);
    engine.executeSchema(dump, null);
    expect(engine.runQuery('SELECT COUNT(*) FROM order_items', RESULT_LIMITS).statements[0]?.rows[0]?.[0]).toBeGreaterThan(0);
  });

  it('inserts explicit records with seedData', () => {
    engine.executeSchema(DEFAULT_SCHEMA, null);
    const r = engine.seedData('users', [{ email: 'a@x.io', first_name: 'A', last_name: 'B' }]);
    expect(r.inserted).toBe(1);
    expect(() => engine.seedData('users', [{ nope: 1 }])).toThrow(/does not exist/);
  });
});
