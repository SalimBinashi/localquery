import type { SQLiteValue, StorageClass } from './database';
import type { DatabaseMetadata } from './database';

export type ErrorCategory =
  | 'syntax'
  | 'constraint'
  | 'schema'
  | 'validation'
  | 'initialization'
  | 'resource'
  | 'execution'
  | 'cancelled'
  | 'internal';

export type OperationPhase = 'init' | 'schema' | 'inspect' | 'seed' | 'validate' | 'query' | 'import' | 'export' | 'url' | 'worker';

export interface SQLiteErrorInfo {
  readonly category: ErrorCategory;
  readonly message: string;
  readonly phase?: OperationPhase;
  readonly statement?: string;
  readonly statementIndex?: number;
  readonly line?: number;
  readonly column?: number;
  readonly code?: string;
  readonly hint?: string;
  readonly recoverable: boolean;
}

export interface SQLiteColumn {
  readonly name: string;
  /** sql.js does not expose sqlite3_column_decltype, so declared types of result columns are unavailable (null). */
  readonly declaredType: string | null;
  /** Storage class observed across retained rows ("mixed" when several non-null classes appear). */
  readonly valueType: StorageClass | 'mixed' | 'unknown';
  /** Whether a NULL was observed in retained rows. */
  readonly containsNull: boolean;
}

export interface ResultLimits {
  readonly maxRetainedRows: number;
  readonly maxPayloadBytes: number;
  readonly maxStatements: number;
}

export interface StatementResult {
  readonly index: number;
  readonly sql: string;
  readonly line: number;
  readonly statementType: string;
  readonly returnsRows: boolean;
  readonly columns: readonly SQLiteColumn[];
  readonly rows: readonly (readonly SQLiteValue[])[];
  /** Total rows produced by SQLite (every row was stepped). */
  readonly rowCount: number;
  /** Rows actually retained and transferred to the UI. */
  readonly retainedRowCount: number;
  readonly truncated: boolean;
  /** sqlite3_changes() — only reported for INSERT/UPDATE/DELETE/REPLACE. */
  readonly changes: number | null;
  /** Time spent inside SQLite for this statement, measured in the worker. */
  readonly executionMs: number;
}

export interface QueryExecutionResult {
  readonly statements: readonly StatementResult[];
  readonly error: SQLiteErrorInfo | null;
  /** Statements after a failing one are not executed. */
  readonly skippedStatements: number;
  readonly totalExecutionMs: number;
  readonly schemaChanged: boolean;
  readonly dataChanged: boolean;
  readonly inTransaction: boolean;
  readonly metadata: DatabaseMetadata | null;
}

export interface QueryHistoryEntry {
  readonly id: number;
  readonly sql: string;
  readonly executedAt: number;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly rowCount: number | null;
}
