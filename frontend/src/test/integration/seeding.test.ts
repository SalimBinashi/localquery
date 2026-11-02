import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '@/test/fixtures/engine';
import type { SQLiteEngine } from '@/lib/sqlite/SQLiteEngine';
import { RESULT_LIMITS } from '@/lib/limits';
import type { SeedConfig } from '@/types/workspace';

const seed = (rowsPerTable: 10 | 50 | 100 = 50): SeedConfig => ({ enabled: true, rowsPerTable, randomSeed: 3, locale: 'en' });

describe('MockDataGenerator against real SQLite', () => {
  let engine: SQLiteEngine;
  const one = (sql: string): unknown => engine.runQuery(sql, RESULT_LIMITS).statements[0]?.rows[0]?.[0];
  beforeEach(async () => {
    engine = await createEngine();
  });

  it('respects unique, NOT NULL, CHECK, text/uuid/composite PKs, defaults and generated columns', () => {
    const r = engine.executeSchema(`
      CREATE TABLE accounts (
        uuid TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        username TEXT UNIQUE,
        quantity INTEGER NOT NULL CHECK (quantity >= 0 AND quantity <= 10),
        rating INTEGER CHECK (rating BETWEEN 1 AND 3),
        status TEXT NOT NULL CHECK (status IN ('a', 'b')),
        code TEXT CHECK (length(code) <= 4),
        is_enabled BOOLEAN NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        misc TEXT NOT NULL DEFAULT 'x',
        price DECIMAL(10,2),
        file_data BLOB,
        doubled INTEGER GENERATED ALWAYS AS (quantity * 2) VIRTUAL
      );
      CREATE TABLE memberships (
        account_uuid TEXT NOT NULL REFERENCES accounts(uuid),
        group_no INTEGER NOT NULL CHECK (group_no BETWEEN 1 AND 4),
        PRIMARY KEY (account_uuid, group_no)
      );`, seed(50));
    const acc = r.seedReport?.tables.find((t) => t.table === 'accounts');
    expect(acc?.inserted).toBe(50);
    expect(one('SELECT COUNT(DISTINCT email) FROM accounts')).toBe(50);
    expect(one('SELECT COUNT(*) FROM accounts WHERE quantity NOT BETWEEN 0 AND 10 OR status NOT IN (\'a\',\'b\') OR length(code) > 4')).toBe(0);
    expect(one("SELECT COUNT(*) FROM accounts WHERE misc <> 'x'")).toBe(0);
    expect(one('SELECT COUNT(*) FROM accounts WHERE doubled <> quantity * 2')).toBe(0);
    expect(one("SELECT COUNT(*) FROM accounts WHERE uuid NOT GLOB '????????-????-????-????-????????????'")).toBe(0);
    expect(one("SELECT COUNT(*) FROM accounts WHERE typeof(file_data) NOT IN ('blob','null')")).toBe(0);
    const m = r.seedReport?.tables.find((t) => t.table === 'memberships');
    expect(m?.inserted).toBeGreaterThan(0);
    expect(one('SELECT COUNT(*) FROM (SELECT account_uuid, group_no FROM memberships GROUP BY 1, 2 HAVING COUNT(*) > 1)')).toBe(0);
  });

  it('generates composite foreign keys as one relationship', () => {
    const r = engine.executeSchema(`
      CREATE TABLE regions (country TEXT NOT NULL, code TEXT NOT NULL, name TEXT, PRIMARY KEY (country, code));
      CREATE TABLE stores (id INTEGER PRIMARY KEY, country TEXT NOT NULL, region_code TEXT NOT NULL,
        FOREIGN KEY (country, region_code) REFERENCES regions(country, code));`, seed(10));
    expect(r.metadata.relationships.find((f) => f.fromTable === 'stores')?.mappings).toEqual([{ from: 'country', to: 'country' }, { from: 'region_code', to: 'code' }]);
    expect(r.seedReport?.tables.find((t) => t.table === 'stores')?.inserted).toBe(10);
    expect(one('SELECT COUNT(*) FROM stores s LEFT JOIN regions r ON r.country = s.country AND r.code = s.region_code WHERE r.code IS NULL')).toBe(0);
  });

  it('handles self references and nullable cycles with an acyclic second pass', () => {
    const r = engine.executeSchema(`
      CREATE TABLE employees (id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, manager_id INTEGER REFERENCES employees(id));
      CREATE TABLE teams (id INTEGER PRIMARY KEY, lead_id INTEGER REFERENCES members(id));
      CREATE TABLE members (id INTEGER PRIMARY KEY, team_id INTEGER NOT NULL REFERENCES teams(id));`, seed(50));
    expect(r.seedReport?.tables.every((t) => t.inserted === 50)).toBe(true);
    expect(Number(one('SELECT COUNT(*) FROM employees WHERE manager_id IS NOT NULL'))).toBeGreaterThan(0);
    expect(one('SELECT COUNT(*) FROM employees WHERE manager_id >= id')).toBe(0);
    expect(Number(one('SELECT COUNT(*) FROM teams WHERE lead_id IS NOT NULL'))).toBeGreaterThan(0);
    expect(engine.runQuery('PRAGMA foreign_key_check', RESULT_LIMITS).statements[0]?.rowCount).toBe(0);
  });

  it('skips NOT NULL cycles, missing parents and virtual tables with reasons', () => {
    const r = engine.executeSchema(`
      CREATE TABLE a (id INTEGER PRIMARY KEY, b_id INTEGER NOT NULL REFERENCES b(id));
      CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER NOT NULL REFERENCES a(id));
      CREATE TABLE orphan (id INTEGER PRIMARY KEY, ghost_id INTEGER NOT NULL REFERENCES ghost(id));
      CREATE VIRTUAL TABLE docs USING fts3(body);
      CREATE TABLE ok (id INTEGER PRIMARY KEY, title TEXT);`, seed(10));
    const by = (n: string) => r.seedReport?.tables.find((t) => t.table === n);
    expect(by('a')?.skipped).toBe(true);
    expect(by('a')?.reasons[0]).toMatch(/cycle/);
    expect(by('orphan')?.reasons[0]).toMatch(/missing table "ghost"/);
    expect(by('docs')?.reasons[0]).toMatch(/Virtual table/);
    expect(by('ok')?.inserted).toBe(10);
    expect(r.metadata.tables.some((t) => t.kind === 'shadow')).toBe(true);
    expect(r.seedReport?.allTargetsMet).toBe(false);
  });

  it('stops after bounded retries on uninterpretable CHECKs and reports actual counts', () => {
    const r = engine.executeSchema('CREATE TABLE t (id INTEGER PRIMARY KEY, x INTEGER NOT NULL CHECK (x % 1000 = 7));', seed(10));
    const t = r.seedReport?.tables[0];
    expect(t?.inserted).toBe(Number(one('SELECT COUNT(*) FROM t')));
    expect(t?.inserted).toBeLessThan(10);
    expect(t?.constraintViolations).toBeGreaterThan(0);
    expect(t?.reasons.join(' ')).toMatch(/CHECK constraint failed/);
  });

  it('limits small unique domains and reports the shortfall', () => {
    const r = engine.executeSchema("CREATE TABLE flags (code TEXT PRIMARY KEY CHECK (code IN ('a','b','c')));", seed(10));
    expect(r.seedReport?.tables[0]?.inserted).toBe(3);
    expect(r.seedReport?.allTargetsMet).toBe(false);
  });

  it('handles quoted identifiers with spaces, quotes and reserved words', () => {
    const r = engine.executeSchema('CREATE TABLE "order" ("select" TEXT, "we""ird col" INTEGER NOT NULL, "from" REAL);', seed(10));
    expect(r.seedReport?.tables[0]?.inserted).toBe(10);
  });
});
