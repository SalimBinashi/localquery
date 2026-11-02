import type { ForeignKeyMeta, TableMeta } from '@/types/database';

export type FkMode =
  /** Values drawn from rows that already exist in the parent when the child is generated. */
  | 'pool'
  /** Inserted as NULL, then filled by UPDATE after the parent exists (cycle breaking / self references). */
  | 'deferred'
  /** Always NULL: parent table does not exist. */
  | 'null';

export interface PlannedForeignKey {
  readonly fk: ForeignKeyMeta;
  readonly mode: FkMode;
  readonly selfReference: boolean;
}

export interface TablePlan {
  readonly table: TableMeta;
  readonly foreignKeys: readonly PlannedForeignKey[];
}

export interface SeedPlan {
  readonly order: readonly TablePlan[];
  readonly skipped: readonly { readonly table: string; readonly reason: string }[];
  readonly warnings: readonly string[];
}

const lc = (s: string): string => s.toLowerCase();

export function isNullableForeignKey(fk: ForeignKeyMeta, table: TableMeta): boolean {
  return fk.mappings.every((m) => {
    const col = table.columns.find((c) => lc(c.name) === lc(m.from));
    return col !== undefined && !col.notNull && col.primaryKeyPosition === 0;
  });
}

/** Builds a dependency-ordered seeding plan (parents first) and breaks cycles via nullable foreign keys. */
export function planSeeding(tables: readonly TableMeta[], maxTables: number): SeedPlan {
  const skipped: { table: string; reason: string }[] = [];
  const warnings: string[] = [];
  const candidates: TableMeta[] = [];
  for (const t of tables) {
    if (!t.seedable) skipped.push({ table: t.name, reason: t.skipReason ?? 'Not seedable' });
    else if (candidates.length >= maxTables) skipped.push({ table: t.name, reason: `Table limit per generation (${maxTables}) reached.` });
    else candidates.push(t);
  }
  const names = new Set(candidates.map((t) => lc(t.name)));
  const modes = new Map<string, PlannedForeignKey[]>();
  const blocked = new Set<string>();
  for (const t of candidates) {
    const planned: PlannedForeignKey[] = [];
    for (const fk of t.foreignKeys) {
      const self = lc(fk.toTable) === lc(t.name);
      const nullable = isNullableForeignKey(fk, t);
      if (!fk.parentExists) {
        if (nullable) {
          planned.push({ fk, mode: 'null', selfReference: false });
          warnings.push(`${t.name}: foreign key to missing table "${fk.toTable}" is left NULL.`);
        } else {
          blocked.add(lc(t.name));
          skipped.push({ table: t.name, reason: `NOT NULL foreign key references missing table "${fk.toTable}".` });
        }
      } else planned.push({ fk, mode: self && nullable ? 'deferred' : 'pool', selfReference: self });
    }
    modes.set(lc(t.name), planned);
  }
  const remaining = candidates.filter((t) => !blocked.has(lc(t.name)));
  const order: TablePlan[] = [];
  const done = new Set<string>();
  const pendingParents = (t: TableMeta): PlannedForeignKey[] =>
    (modes.get(lc(t.name)) ?? []).filter((p) => p.mode === 'pool' && !p.selfReference && names.has(lc(p.fk.toTable)) && !done.has(lc(p.fk.toTable)) && !blocked.has(lc(p.fk.toTable)));
  while (remaining.length > 0) {
    const readyIdx = remaining.findIndex((t) => pendingParents(t).length === 0);
    if (readyIdx >= 0) {
      const [t] = remaining.splice(readyIdx, 1) as [TableMeta];
      done.add(lc(t.name));
      order.push({ table: t, foreignKeys: modes.get(lc(t.name)) ?? [] });
      continue;
    }
    const breakable = remaining.flatMap((t) => pendingParents(t).filter((p) => isNullableForeignKey(p.fk, t)).map((p) => ({ t, p })))[0];
    if (breakable) {
      const list = modes.get(lc(breakable.t.name)) ?? [];
      modes.set(lc(breakable.t.name), list.map((p) => (p === breakable.p ? { ...p, mode: 'deferred' } : p)));
      warnings.push(`Cycle broken: ${breakable.t.name} → ${breakable.p.fk.toTable} is filled in a second pass (UPDATE).`);
      continue;
    }
    const cycle = remaining.map((t) => t.name).join(', ');
    for (const t of remaining.splice(0)) skipped.push({ table: t.name, reason: `Part of a NOT NULL foreign-key cycle that cannot be broken safely (${cycle}).` });
  }
  return { order, skipped, warnings };
}
