import type { Faker } from '@faker-js/faker';
import type { Database, SqlValue } from 'sql.js';
import type { ColumnMeta, DatabaseMetadata, TableMeta } from '@/types/database';
import type { SeedConfig } from '@/types/workspace';
import type { GenValue, PairwiseComparison, SeedReport, TableSeedResult } from '@/lib/seeding/seedTypes';
import { createSeededFaker, logicalType, matchesSemanticRule, NULL_HEAVY_COLUMN, produceValue, singularEntity, type GenContext } from '@/lib/seeding/fakerMappings';
import { hintsForColumn, pairwiseComparisons } from '@/lib/seeding/constraintHints';
import { planSeeding, type PlannedForeignKey, type TablePlan } from '@/lib/seeding/relationalPlanner';
import { normalizeIdentifier, quoteIdentifier } from '@/lib/schema/identifierUtils';
import { queryAll, queryScalar } from '@/lib/sqlite/sqliteMetadata';
import { engineError } from '@/lib/sqlite/sqliteErrors';
import { GENERATOR_VERSION, SEED_LIMITS } from '@/lib/limits';

export type SeedLimits = typeof SEED_LIMITS;

type ColumnRole =
  | { readonly kind: 'fk'; readonly fkIndex: number; readonly position: number }
  | { readonly kind: 'deferred-null' }
  | { readonly kind: 'value'; readonly ctx: GenContext; readonly nullRate: number; readonly maxLength: number; readonly isInteger: boolean };

interface InsertColumn {
  readonly column: ColumnMeta;
  readonly role: ColumnRole;
}

type Tuple = readonly SqlValue[];

const lc = (s: string): string => s.toLowerCase();
const CONSTRAINT_LIKE = /constraint failed|cannot store|datatype mismatch/i;

function toBindable(v: SqlValue): GenValue {
  return v instanceof Uint8Array || typeof v === 'string' || typeof v === 'number' || v === null ? v : Number(v);
}

function keyOf(values: readonly GenValue[]): string | null {
  if (values.some((v) => v === null)) return null; // NULLs never collide in UNIQUE constraints
  return JSON.stringify(values.map((v) => (v instanceof Uint8Array ? Array.from(v) : typeof v === 'string' ? v.toLowerCase() : v)));
}

function constrain(value: GenValue, role: Extract<ColumnRole, { kind: 'value' }>, faker: Faker): GenValue {
  const h = role.ctx.hints;
  if (typeof value === 'number') {
    const lo = h.min !== undefined ? h.min + (h.minExclusive ? (role.isInteger ? 1 : 0.01) : 0) : undefined;
    const hi = h.max !== undefined ? h.max - (h.maxExclusive ? (role.isInteger ? 1 : 0.01) : 0) : undefined;
    if ((lo !== undefined && value < lo) || (hi !== undefined && value > hi)) {
      const min = lo ?? Math.min(0, hi ?? 0);
      const max = hi ?? min + 1000;
      return role.isInteger ? faker.number.int({ min: Math.ceil(min), max: Math.floor(Math.max(min, max)) }) : faker.number.float({ min, max: Math.max(min, max), fractionDigits: 2 });
    }
    return value;
  }
  if (typeof value === 'string') {
    let s = value.slice(0, role.maxLength);
    if (h.minLength !== undefined && s.length < h.minLength) s = s.padEnd(h.minLength, 'x');
    return s;
  }
  return value;
}

function uniquify(value: GenValue, seq: number): GenValue {
  if (typeof value === 'number') return Number.isInteger(value) ? value + seq : Number((value + seq / 1000).toFixed(4));
  if (typeof value === 'string') {
    const at = value.indexOf('@');
    return at > 0 ? `${value.slice(0, at)}+${seq}${value.slice(at)}` : `${value}-${seq}`;
  }
  return value;
}

function repairPairs(row: Map<string, GenValue>, pairs: readonly PairwiseComparison[]): void {
  for (const { left, op, right } of pairs) {
    const a = row.get(lc(left));
    const b = row.get(lc(right));
    if (a === undefined || b === undefined || a === null || b === null || typeof a !== typeof b || a instanceof Uint8Array) continue;
    const ok = op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
    if (!ok) {
      row.set(lc(left), b);
      row.set(lc(right), a);
    }
  }
}

class TableSeeder {
  private readonly insertColumns: InsertColumn[] = [];
  private readonly pools: (readonly Tuple[])[] = [];
  private readonly uniqueSets: { cols: string[]; seen: Set<string> }[] = [];
  private readonly pairs: readonly PairwiseComparison[];
  readonly reasons: string[] = [];
  violations = 0;
  deferred = 0;

  constructor(
    private readonly db: Database,
    private readonly plan: TablePlan,
    private readonly faker: Faker,
    private readonly limits: SeedLimits,
  ) {
    this.pairs = pairwiseComparisons(plan.table.checks);
  }

  /** Returns a skip reason, or null when the table can be generated. */
  prepare(): string | null {
    const { table, foreignKeys } = this.plan;
    for (const [i, p] of foreignKeys.entries()) {
      if (p.mode !== 'pool') {
        this.pools.push([]);
        if (p.mode === 'deferred') this.deferred++;
        continue;
      }
      const pool = this.parentPool(p);
      this.pools.push(pool);
      if (pool.length === 0 && !this.fkNullable(i)) {
        return p.selfReference
          ? `NOT NULL self-referencing foreign key (${p.fk.mappings.map((m) => m.from).join(', ')}) needs an existing root row.`
          : `Parent table "${p.fk.toTable}" has no rows to reference and the foreign key is NOT NULL.`;
      }
    }
    const entity = singularEntity(normalizeIdentifier(table.name));
    const siblings = table.columns.map((c) => normalizeIdentifier(c.name));
    for (const column of table.columns) {
      const role = this.roleFor(column, entity, siblings);
      if (role) this.insertColumns.push({ column, role });
    }
    for (const key of table.uniqueKeys) {
      const cols = key.filter((k) => this.insertColumns.some((ic) => lc(ic.column.name) === lc(k)));
      if (cols.length !== key.length) continue; // includes an SQLite-assigned column: always unique
      const seen = new Set<string>();
      for (const r of queryAll(this.db, `SELECT ${cols.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(table.name)}`)) {
        const k = keyOf(Object.values(r).map(toBindable));
        if (k) seen.add(k);
      }
      this.uniqueSets.push({ cols: cols.map(lc), seen });
    }
    return null;
  }

  private fkNullable(fkIndex: number): boolean {
    const fk = this.plan.foreignKeys[fkIndex]?.fk;
    return fk !== undefined && fk.mappings.every((m) => !this.plan.table.columns.find((c) => lc(c.name) === lc(m.from))?.notNull);
  }

  private parentPool(p: PlannedForeignKey): Tuple[] {
    const cols = p.fk.mappings.map((m) => quoteIdentifier(m.to));
    const notNull = cols.map((c) => `${c} IS NOT NULL`).join(' AND ');
    return queryAll(this.db, `SELECT DISTINCT ${cols.join(', ')} FROM ${quoteIdentifier(p.fk.toTable)} WHERE ${notNull} LIMIT ${this.limits.parentPoolLimit}`).map((r) => Object.values(r));
  }

  private roleFor(column: ColumnMeta, entity: string, siblings: string[]): ColumnRole | null {
    if (column.visibility !== 'normal') return null; // generated / hidden columns are computed by SQLite
    const fkIndex = this.plan.foreignKeys.findIndex((p) => p.fk.mappings.some((m) => lc(m.from) === lc(column.name)));
    const planned = this.plan.foreignKeys[fkIndex];
    if (planned) {
      if (planned.mode !== 'pool') return { kind: 'deferred-null' };
      return { kind: 'fk', fkIndex, position: planned.fk.mappings.findIndex((m) => lc(m.from) === lc(column.name)) };
    }
    if (column.isRowidAlias) return null; // SQLite assigns INTEGER PRIMARY KEY values
    const logical = logicalType(column.declaredType);
    const name = normalizeIdentifier(column.name);
    const hints = hintsForColumn(column.name, this.plan.table.checks);
    const inUnique = this.plan.table.uniqueKeys.some((k) => k.some((c) => lc(c) === lc(column.name)));
    if (column.defaultValue !== null && !inUnique && !hints.allowed && !matchesSemanticRule(name, logical.type)) return null; // let SQLite apply DEFAULT
    const nullable = !column.notNull && column.primaryKeyPosition === 0 && !inUnique;
    const nullRate = !nullable ? 0 : NULL_HEAVY_COLUMN.test(name) ? 0.7 : this.limits.nullRate;
    const ctx: GenContext = { faker: this.faker, table: this.plan.table.name, entity, name, logical, hints, siblings };
    return { kind: 'value', ctx, nullRate, maxLength: Math.min(hints.maxLength ?? Infinity, logical.length ?? Infinity, this.limits.maxTextLength), isInteger: logical.type === 'integer' || column.affinity === 'INTEGER' };
  }

  private buildRow(attempt: number, seq: number): GenValue[] {
    const fkChoice = this.plan.foreignKeys.map((_, i) => {
      const pool = this.pools[i] ?? [];
      if (pool.length === 0 || (this.fkNullable(i) && this.faker.number.float() < this.limits.nullRate)) return null;
      return this.faker.helpers.arrayElement(pool);
    });
    const row = new Map<string, GenValue>();
    for (const { column, role } of this.insertColumns) {
      let v: GenValue = null;
      if (role.kind === 'fk') v = toBindable(fkChoice[role.fkIndex]?.[role.position] ?? null);
      else if (role.kind === 'value') {
        if (role.nullRate > 0 && this.faker.number.float() < role.nullRate) v = null;
        else {
          v = constrain(produceValue(role.ctx).value, role, this.faker);
          const unique = this.uniqueSets.some((u) => u.cols.includes(lc(column.name)));
          if (unique && attempt >= 2) v = constrain(uniquify(v, seq), role, this.faker);
        }
      }
      row.set(lc(column.name), v);
    }
    repairPairs(row, this.pairs);
    return this.insertColumns.map((ic) => row.get(lc(ic.column.name)) ?? null);
  }

  private collides(values: GenValue[]): boolean {
    return this.uniqueSets.some((u) => {
      const k = keyOf(u.cols.map((c) => values[this.insertColumns.findIndex((ic) => lc(ic.column.name) === c)] ?? null));
      return k !== null && u.seen.has(k);
    });
  }

  private remember(values: GenValue[]): void {
    for (const u of this.uniqueSets) {
      const k = keyOf(u.cols.map((c) => values[this.insertColumns.findIndex((ic) => lc(ic.column.name) === c)] ?? null));
      if (k) u.seen.add(k);
    }
  }

  insertRows(target: number, deadline: number, seqBase: number): void {
    const t = quoteIdentifier(this.plan.table.name);
    const sql = this.insertColumns.length
      ? `INSERT INTO ${t} (${this.insertColumns.map((c) => quoteIdentifier(c.column.name)).join(', ')}) VALUES (${this.insertColumns.map(() => '?').join(', ')})`
      : `INSERT INTO ${t} DEFAULT VALUES`;
    const stmt = this.db.prepare(sql);
    let failures = 0;
    const messages = new Set<string>();
    try {
      for (let i = 0; i < target && failures < this.limits.maxFailuresPerTable; i++) {
        if (performance.now() > deadline) throw engineError('resource', `Seed generation exceeded ${this.limits.timeoutMs} ms. Reduce the density or number of tables.`, { phase: 'seed' });
        let inserted = false;
        for (let attempt = 0; attempt < this.limits.maxAttemptsPerRow && !inserted; attempt++) {
          const values = this.buildRow(attempt, seqBase + i * this.limits.maxAttemptsPerRow + attempt);
          if (this.collides(values)) continue;
          try {
            stmt.run(this.insertColumns.length ? values : undefined);
            this.remember(values);
            inserted = true;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!CONSTRAINT_LIKE.test(msg)) throw e;
            this.violations++;
            messages.add(msg);
          }
        }
        if (!inserted) failures++;
      }
    } finally {
      stmt.free();
    }
    if (failures > 0) this.reasons.push(`${failures} row(s) could not be generated within ${this.limits.maxAttemptsPerRow} attempts (unique combinations exhausted or constraint rejected values).`);
    if (failures >= this.limits.maxFailuresPerTable) this.reasons.push('Stopped early after too many failed rows.');
    for (const m of [...messages].slice(0, 3)) this.reasons.push(`SQLite rejected generated values: ${m}`);
  }
}

function fillDeferred(db: Database, table: TableMeta, p: PlannedForeignKey, faker: Faker, nullRate: number): number {
  const t = quoteIdentifier(table.name);
  const locator = table.withoutRowid ? table.primaryKey : ['rowid'];
  const loc = locator.map((c) => (c === 'rowid' ? 'rowid' : quoteIdentifier(c)));
  const childRows = queryAll(db, `SELECT ${loc.join(', ')} FROM ${t} ORDER BY ${loc.join(', ')}`).map((r) => Object.values(r));
  const parentCols = p.fk.mappings.map((m) => quoteIdentifier(m.to));
  const sameTable = p.selfReference;
  const parentRows = sameTable
    ? queryAll(db, `SELECT ${parentCols.join(', ')} FROM ${t} ORDER BY ${loc.join(', ')}`).map((r) => Object.values(r))
    : queryAll(db, `SELECT DISTINCT ${parentCols.join(', ')} FROM ${quoteIdentifier(p.fk.toTable)} WHERE ${parentCols.map((c) => `${c} IS NOT NULL`).join(' AND ')}`).map((r) => Object.values(r));
  const stmt = db.prepare(`UPDATE ${t} SET ${p.fk.mappings.map((m) => `${quoteIdentifier(m.from)} = ?`).join(', ')} WHERE ${loc.map((c) => `${c} IS ?`).join(' AND ')}`);
  let violations = 0;
  try {
    childRows.forEach((locValues, k) => {
      // Self references only point at earlier rows, producing an acyclic hierarchy.
      const candidates = sameTable ? parentRows.slice(0, k).filter((r) => r.every((v) => v !== null)) : parentRows;
      if (candidates.length === 0 || faker.number.float() < (sameTable ? 0.2 : nullRate)) return;
      const parent = faker.helpers.arrayElement(candidates);
      try {
        stmt.run([...parent.map(toBindable), ...locValues.map(toBindable)]);
      } catch (e) {
        if (!CONSTRAINT_LIKE.test(e instanceof Error ? e.message : '')) throw e;
        violations++;
      }
    });
  } finally {
    stmt.free();
  }
  return violations;
}

const countRows = (db: Database, table: string): number => Number(queryScalar(db, `SELECT COUNT(*) FROM ${quoteIdentifier(table)}`));

/**
 * Generates relational mock data directly into `db`. The caller owns the surrounding
 * transaction/savepoint and must roll back if this throws.
 */
export function generateSeedData(db: Database, metadata: DatabaseMetadata, config: SeedConfig, limits: SeedLimits = SEED_LIMITS): SeedReport {
  const started = performance.now();
  const deadline = started + limits.timeoutMs;
  const faker = createSeededFaker(config.randomSeed, config.locale);
  const plan = planSeeding(metadata.tables, limits.maxTables);
  const results: TableSeedResult[] = plan.skipped.map((s) => ({ table: s.table, requested: config.rowsPerTable, inserted: 0, skipped: true, reasons: [s.reason], constraintViolations: 0, deferredRelationships: 0 }));
  const warnings = [...plan.warnings];
  let total = 0;
  const seeded: TablePlan[] = [];
  for (const tp of plan.order) {
    const before = countRows(db, tp.table.name);
    const seeder = new TableSeeder(db, tp, faker, limits);
    const skip = seeder.prepare();
    if (skip) {
      results.push({ table: tp.table.name, requested: config.rowsPerTable, inserted: 0, skipped: true, reasons: [skip], constraintViolations: 0, deferredRelationships: 0 });
      continue;
    }
    const budget = Math.max(0, limits.maxTotalRows - total);
    const target = Math.min(config.rowsPerTable, budget);
    if (target < config.rowsPerTable) seeder.reasons.push(`Global row limit (${limits.maxTotalRows}) reached; target reduced to ${target}.`);
    seeder.insertRows(target, deadline, before + 1);
    const inserted = countRows(db, tp.table.name) - before;
    total += inserted;
    seeded.push(tp);
    results.push({ table: tp.table.name, requested: config.rowsPerTable, inserted, skipped: false, reasons: seeder.reasons, constraintViolations: seeder.violations, deferredRelationships: seeder.deferred });
  }
  for (const tp of seeded) {
    for (const p of tp.foreignKeys.filter((f) => f.mode === 'deferred')) {
      const v = fillDeferred(db, tp.table, p, faker, limits.nullRate);
      if (v > 0) warnings.push(`${tp.table.name}: ${v} deferred foreign-key update(s) were rejected and left NULL.`);
    }
  }
  const fkViolations = queryAll(db, 'PRAGMA foreign_key_check');
  if (fkViolations.length > 0) {
    throw engineError('constraint', `Generated data failed foreign-key validation (${fkViolations.length} orphan row(s)); the seed was rolled back.`, { phase: 'validate', code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  }
  const order = new Map(metadata.tables.map((t, i) => [t.name, i]));
  results.sort((a, b) => (order.get(a.table) ?? 0) - (order.get(b.table) ?? 0));
  return {
    generatorVersion: GENERATOR_VERSION,
    randomSeed: config.randomSeed,
    rowsPerTable: config.rowsPerTable,
    locale: config.locale,
    tablesDiscovered: metadata.tables.length,
    tables: results,
    totalInserted: total,
    relationshipsValidated: seeded.reduce((n, tp) => n + tp.foreignKeys.length, 0),
    foreignKeyViolations: 0,
    durationMs: performance.now() - started,
    warnings,
    allTargetsMet: results.every((r) => !r.skipped && r.inserted >= r.requested),
  };
}
