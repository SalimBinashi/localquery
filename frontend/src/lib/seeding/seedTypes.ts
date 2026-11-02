import type { BindableValue } from '@/types/database';

export type GenValue = BindableValue;
export type SeedRecord = Readonly<Record<string, BindableValue>>;

export interface ColumnHints {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
  allowed?: readonly (string | number)[];
  minLength?: number;
  maxLength?: number;
  /** CHECK fragments the generator cannot interpret; SQLite stays the final validator. */
  unsupported: string[];
}

export interface PairwiseComparison {
  readonly left: string;
  readonly op: '<' | '<=' | '>' | '>=';
  readonly right: string;
}

export interface TableSeedResult {
  readonly table: string;
  readonly requested: number;
  /** Actual rows added, measured with COUNT(*) before and after. */
  readonly inserted: number;
  readonly skipped: boolean;
  readonly reasons: readonly string[];
  readonly constraintViolations: number;
  readonly deferredRelationships: number;
}

export interface SeedReport {
  readonly generatorVersion: number;
  readonly randomSeed: number;
  readonly rowsPerTable: number;
  readonly locale: string;
  readonly tablesDiscovered: number;
  readonly tables: readonly TableSeedResult[];
  readonly totalInserted: number;
  readonly relationshipsValidated: number;
  readonly foreignKeyViolations: number;
  readonly durationMs: number;
  readonly warnings: readonly string[];
  readonly allTargetsMet: boolean;
}

export interface SeedResult {
  readonly table: string;
  readonly inserted: number;
  readonly durationMs: number;
}
