import type { DatabaseMetadata } from '@/types/database';
import type { QueryExecutionResult, ResultLimits, SQLiteErrorInfo } from '@/types/query';
import type { SeedConfig } from '@/types/workspace';
import type { SeedRecord, SeedReport, SeedResult } from '@/lib/seeding/seedTypes';

export interface SchemaStatementOutcome {
  readonly index: number;
  readonly line: number;
  readonly statementType: string;
  readonly executionMs: number;
}

export interface SchemaExecutionResult {
  readonly statements: readonly SchemaStatementOutcome[];
  readonly metadata: DatabaseMetadata;
  readonly seedReport: SeedReport | null;
  readonly timings: { readonly schemaMs: number; readonly inspectMs: number; readonly seedMs: number | null; readonly totalMs: number };
}

export interface InitResult {
  readonly durationMs: number;
  readonly sqliteVersion: string;
}

export interface ImportResult {
  readonly metadata: DatabaseMetadata;
  readonly schemaSql: string;
}

/** Request payloads, keyed by message type. */
export interface WorkerRequestPayloads {
  INIT: Record<string, never>;
  APPLY_SCHEMA: { readonly ddl: string; readonly seed: SeedConfig | null };
  SEED_DATABASE: { readonly seed: SeedConfig };
  INSERT_RECORDS: { readonly table: string; readonly records: readonly SeedRecord[] };
  EXECUTE_QUERY: { readonly sql: string; readonly limits: ResultLimits };
  GET_SCHEMA_METADATA: Record<string, never>;
  RESET_DATABASE: Record<string, never>;
  EXPORT_DATABASE: Record<string, never>;
  EXPORT_SQL_DUMP: Record<string, never>;
  IMPORT_DATABASE: { readonly bytes: Uint8Array };
  DISPOSE: Record<string, never>;
}

/** Success results, keyed by message type. */
export interface WorkerResults {
  INIT: InitResult;
  APPLY_SCHEMA: SchemaExecutionResult;
  SEED_DATABASE: { readonly report: SeedReport; readonly metadata: DatabaseMetadata };
  INSERT_RECORDS: SeedResult;
  EXECUTE_QUERY: QueryExecutionResult;
  GET_SCHEMA_METADATA: DatabaseMetadata;
  RESET_DATABASE: DatabaseMetadata;
  EXPORT_DATABASE: { readonly bytes: Uint8Array; readonly durationMs: number };
  EXPORT_SQL_DUMP: { readonly sql: string; readonly durationMs: number };
  IMPORT_DATABASE: ImportResult;
  DISPOSE: { readonly disposed: true };
}

export type WorkerRequestType = keyof WorkerRequestPayloads;

export type WorkerRequest = {
  [K in WorkerRequestType]: { readonly id: number; readonly type: K; readonly payload: WorkerRequestPayloads[K] };
}[WorkerRequestType];

export type WorkerSuccess = {
  [K in WorkerRequestType]: { readonly id: number; readonly kind: 'success'; readonly type: K; readonly result: WorkerResults[K] };
}[WorkerRequestType];

export interface WorkerFailure {
  readonly id: number;
  readonly kind: 'failure';
  readonly error: SQLiteErrorInfo;
}

export interface WorkerProgress {
  readonly id: number;
  readonly kind: 'progress';
  readonly phase: 'schema' | 'inspect' | 'seed' | 'validate' | 'query';
  readonly detail: string;
}

export type WorkerResponse = WorkerSuccess | WorkerFailure | WorkerProgress;

const REQUEST_TYPES: readonly WorkerRequestType[] = ['INIT', 'APPLY_SCHEMA', 'SEED_DATABASE', 'INSERT_RECORDS', 'EXECUTE_QUERY', 'GET_SCHEMA_METADATA', 'RESET_DATABASE', 'EXPORT_DATABASE', 'EXPORT_SQL_DUMP', 'IMPORT_DATABASE', 'DISPOSE'];

export function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'number' && typeof v.type === 'string' && REQUEST_TYPES.includes(v.type as WorkerRequestType) && typeof v.payload === 'object' && v.payload !== null;
}

export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'number' && (v.kind === 'success' || v.kind === 'failure' || v.kind === 'progress');
}

/** Main-thread asynchronous engine contract implemented by SQLiteWorkerClient. */
export interface AsyncSQLiteEngine {
  initialize(): Promise<InitResult>;
  executeSchema(ddl: string, seed: SeedConfig | null): Promise<SchemaExecutionResult>;
  seedData(table: string, data: readonly SeedRecord[]): Promise<SeedResult>;
  runQuery(sql: string, limits: ResultLimits): Promise<QueryExecutionResult>;
  getSchemaMetadata(): Promise<DatabaseMetadata>;
  resetDatabase(): Promise<DatabaseMetadata>;
  dispose(): Promise<void>;
}
