import { describe, expect, it } from 'vitest';
import { cellKind, formatCell, toCsv, toTsv } from '@/lib/query/resultFormatter';
import { normalizeError } from '@/lib/sqlite/sqliteErrors';
import { hintsForColumn, pairwiseComparisons } from '@/lib/seeding/constraintHints';
import { createSeededFaker, logicalType, produceValue, type GenContext } from '@/lib/seeding/fakerMappings';
import { planSeeding } from '@/lib/seeding/relationalPlanner';
import type { CheckConstraint, ColumnMeta, ForeignKeyMeta, TableMeta } from '@/types/database';

describe('result formatting', () => {
  it('distinguishes NULL, empty string, zero, BLOB and int64', () => {
    expect(formatCell(null, 10)).toMatchObject({ kind: 'null', display: 'NULL' });
    expect(cellKind('NULL')).toBe('text');
    expect(cellKind(0)).toBe('integer');
    expect(formatCell(new Uint8Array([1, 2, 3]), 10).display).toBe('BLOB 3 B · 010203');
    expect(formatCell({ kind: 'int64', text: '9223372036854775807' }, 50).display).toBe('9223372036854775807');
    expect(formatCell('x'.repeat(20), 5)).toMatchObject({ display: 'xxxxx…', truncated: true });
  });
  it('exports CSV preserving NULL vs empty string and escaping', () => {
    expect(toCsv(['a', 'b,c'], [[null, ''], ['x"y', 'line\nbreak'], [0, new Uint8Array([255])]])).toBe('a,"b,c"\r\n,""\r\n"x""y","line\nbreak"\r\n0,\\xff');
    expect(toTsv(['a'], [[null], ['t\tab']])).toBe('a\nNULL\nt ab');
  });
});

describe('error normalization', () => {
  it('categorizes SQLite messages and refines position', () => {
    const e = normalizeError(new Error('near "FORM": syntax error'), { statement: 'SELECT *\nFORM t', line: 3, column: 1 });
    expect(e).toMatchObject({ category: 'syntax', line: 4, column: 1 });
    expect(normalizeError(new Error('UNIQUE constraint failed: users.email')).code).toBe('SQLITE_CONSTRAINT_UNIQUE');
    expect(normalizeError(new Error('no such table: x')).category).toBe('schema');
    expect(normalizeError(new Error('no such module: fts5')).hint).toMatch(/not compiled/);
    expect(normalizeError('weird').category).toBe('execution');
  });
});

describe('CHECK constraint hints', () => {
  const chk = (expression: string, columns: string[]): CheckConstraint => ({ expression, scope: 'column', columns });
  it('derives ranges, IN lists and length bounds', () => {
    expect(hintsForColumn('qty', [chk('qty >= 0 AND qty < 50', ['qty'])])).toMatchObject({ min: 0, max: 50, maxExclusive: true, unsupported: [] });
    expect(hintsForColumn('r', [chk('r BETWEEN 1 AND 5', ['r'])])).toMatchObject({ min: 1, max: 5 });
    expect(hintsForColumn('s', [chk("s IN ('a', 'b')", ['s'])]).allowed).toEqual(['a', 'b']);
    expect(hintsForColumn('code', [chk('length(code) <= 4', ['code'])]).maxLength).toBe(4);
    expect(hintsForColumn('p', [chk('-5 < p', ['p'])]).min).toBe(-5);
    expect(hintsForColumn('x', [chk('x % 2 = 0', ['x'])]).unsupported).toHaveLength(1);
    expect(pairwiseComparisons([chk('start_at <= end_at', ['start_at', 'end_at'])])).toEqual([{ left: 'start_at', op: '<=', right: 'end_at' }]);
  });
});

describe('semantic faker mappings', () => {
  const ctx = (name: string, declared = 'TEXT', table = 'users', seed = 1): GenContext => ({ faker: createSeededFaker(seed, 'en'), table, entity: table.replace(/s$/, ''), name, logical: logicalType(declared), hints: { unsupported: [] }, siblings: [] });
  it('maps names to realistic, type-compatible values', () => {
    expect(produceValue(ctx('email')).value).toMatch(/^[^@\s]+@example\.com$/);
    expect(produceValue(ctx('uuid')).value).toMatch(/^[0-9a-f-]{36}$/);
    expect(produceValue(ctx('created_at')).value).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect(typeof produceValue(ctx('created_at', 'INTEGER')).value).toBe('number');
    expect(produceValue(ctx('birth_date', 'DATE')).value).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect([0, 1]).toContain(produceValue(ctx('is_active', 'BOOLEAN')).value);
    expect(produceValue(ctx('payload', 'JSON')).source).toBe('json');
    expect(() => JSON.parse(String(produceValue(ctx('metadata')).value))).not.toThrow();
    expect(produceValue(ctx('file_data', 'BLOB')).value).toBeInstanceOf(Uint8Array);
    expect(produceValue(ctx('password_hash')).value).toMatch(/^synthetic\$/);
    expect(['pending', 'paid', 'shipped', 'delivered', 'cancelled']).toContain(produceValue(ctx('status', 'TEXT', 'orders')).value);
    expect(produceValue(ctx('email', 'INTEGER')).source).toBe('type:integer');
  });
  it('is deterministic for a seed', () => {
    expect(produceValue(ctx('first_name', 'TEXT', 'users', 5)).value).toBe(produceValue(ctx('first_name', 'TEXT', 'users', 5)).value);
  });
});

describe('relational planner', () => {
  const col = (name: string, notNull = false, pk = 0): ColumnMeta => ({ cid: 0, name, declaredType: 'INTEGER', affinity: 'INTEGER', notNull, defaultValue: null, primaryKeyPosition: pk, visibility: 'normal', isRowidAlias: pk === 1, autoIncrement: false });
  const fk = (from: string, to: string, col: string): ForeignKeyMeta => ({ id: 0, fromTable: from, toTable: to, mappings: [{ from: col, to: 'id' }], onDelete: '', onUpdate: '', match: '', impliedParentColumns: false, parentExists: true });
  const table = (name: string, columns: ColumnMeta[], fks: ForeignKeyMeta[] = []): TableMeta => ({ name, kind: 'table', withoutRowid: false, strict: false, sql: null, columns, primaryKey: ['id'], uniqueKeys: [['id']], checks: [], foreignKeys: fks, indexes: [], rowCount: 0, seedable: true, skipReason: null, parseWarnings: [] });
  it('orders parents before children', () => {
    const plan = planSeeding([table('orders', [col('id', true, 1), col('user_id', true)], [fk('orders', 'users', 'user_id')]), table('users', [col('id', true, 1)])], 10);
    expect(plan.order.map((p) => p.table.name)).toEqual(['users', 'orders']);
  });
  it('breaks nullable cycles and skips NOT NULL cycles', () => {
    const a = table('a', [col('id', true, 1), col('b_id', false)], [fk('a', 'b', 'b_id')]);
    const b = table('b', [col('id', true, 1), col('a_id', true)], [fk('b', 'a', 'a_id')]);
    const plan = planSeeding([a, b], 10);
    expect(plan.order.map((p) => p.table.name)).toEqual(['a', 'b']);
    expect(plan.order[0]?.foreignKeys[0]?.mode).toBe('deferred');
    const c = table('c', [col('id', true, 1), col('d_id', true)], [fk('c', 'd', 'd_id')]);
    const d = table('d', [col('id', true, 1), col('c_id', true)], [fk('d', 'c', 'c_id')]);
    expect(planSeeding([c, d], 10).skipped.map((s) => s.table).sort()).toEqual(['c', 'd']);
  });
  it('defers nullable self references', () => {
    const e = table('employees', [col('id', true, 1), col('manager_id')], [fk('employees', 'employees', 'manager_id')]);
    expect(planSeeding([e], 10).order[0]?.foreignKeys[0]).toMatchObject({ mode: 'deferred', selfReference: true });
  });
});
