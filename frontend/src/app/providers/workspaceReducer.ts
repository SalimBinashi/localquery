import type { DatabaseMetadata } from '@/types/database';
import type { QueryExecutionResult, QueryHistoryEntry, SQLiteErrorInfo } from '@/types/query';
import type { PlaygroundState, SeedConfig } from '@/types/workspace';
import type { SchemaExecutionResult } from '@/lib/sqlite/sqliteTypes';
import type { SeedReport } from '@/lib/seeding/seedTypes';
import type { WorkerRequestType } from '@/lib/sqlite/sqliteTypes';
import { defaultWorkspace } from '@/lib/defaults';
import { GENERATOR_VERSION } from '@/lib/limits';

export type EngineStatus = 'initializing' | 'ready' | 'executing' | 'error' | 'disposed';
export type BusyKind = 'schema' | 'query' | 'export' | 'import' | 'reset' | 'restart';
export type InspectorTab = 'results' | 'erd' | 'details';

export interface AppliedSchema {
  readonly text: string;
  readonly seed: SeedConfig | null;
  readonly at: number;
  readonly result: Pick<SchemaExecutionResult, 'statements' | 'timings'>;
  readonly roundTripMs: number;
}

export interface QueryRun {
  readonly sql: string;
  readonly result: QueryExecutionResult;
  readonly roundTripMs: number;
  readonly finishedAt: number;
}

export interface Notice {
  readonly id: number;
  readonly kind: 'info' | 'warning' | 'error' | 'success';
  readonly message: string;
  readonly action?: 'apply-schema';
}

export interface WorkspaceState {
  readonly schemaText: string;
  readonly queryText: string;
  readonly seedConfig: SeedConfig;
  readonly seedOnApply: boolean;
  readonly engineStatus: Exclude<EngineStatus, 'executing'>;
  readonly initMs: number | null;
  readonly sqliteVersion: string | null;
  readonly engineError: SQLiteErrorInfo | null;
  readonly stall: { readonly type: WorkerRequestType; readonly elapsedMs: number } | null;
  readonly busy: BusyKind | null;
  readonly progress: string | null;
  readonly metadata: DatabaseMetadata | null;
  readonly applied: AppliedSchema | null;
  readonly seedReport: SeedReport | null;
  readonly schemaError: SQLiteErrorInfo | null;
  readonly queryRun: QueryRun | null;
  readonly queryError: SQLiteErrorInfo | null;
  readonly resultsCleared: string | null;
  readonly history: readonly QueryHistoryEntry[];
  /** Console mutations/imports not reproducible from schema + seed. */
  readonly dbDirty: boolean;
  readonly lastSharedHash: string | null;
  readonly notices: readonly Notice[];
  readonly inspectorTab: InspectorTab;
}

export type WorkspaceAction =
  | { type: 'EDIT_SCHEMA'; text: string }
  | { type: 'EDIT_QUERY'; text: string }
  | { type: 'SET_SEED_CONFIG'; patch: Partial<SeedConfig> }
  | { type: 'SET_SEED_ON_APPLY'; value: boolean }
  | { type: 'ENGINE_INIT_START' }
  | { type: 'ENGINE_READY'; initMs: number; version: string }
  | { type: 'ENGINE_FATAL'; error: SQLiteErrorInfo }
  | { type: 'ENGINE_STALL'; stall: WorkspaceState['stall'] }
  | { type: 'ENGINE_DISPOSED' }
  | { type: 'BUSY'; kind: BusyKind | null }
  | { type: 'PROGRESS'; detail: string | null }
  | { type: 'SCHEMA_APPLIED'; text: string; seed: SeedConfig | null; result: SchemaExecutionResult; roundTripMs: number }
  | { type: 'SCHEMA_FAILED'; error: SQLiteErrorInfo }
  | { type: 'QUERY_DONE'; run: QueryRun }
  | { type: 'QUERY_FAILED'; error: SQLiteErrorInfo; sql: string }
  | { type: 'HISTORY_CLEAR' }
  | { type: 'RESTORE_WORKSPACE'; state: PlaygroundState }
  | { type: 'DATABASE_REPLACED'; metadata: DatabaseMetadata; reason: string; dirty: boolean; schemaText?: string }
  | { type: 'SHARED'; hash: string }
  | { type: 'NOTICE'; notice: Omit<Notice, 'id'> }
  | { type: 'DISMISS_NOTICE'; id: number }
  | { type: 'SET_TAB'; tab: InspectorTab };

let noticeId = 0;
let historyId = 0;

export function initialState(restored: PlaygroundState | null, notice: Omit<Notice, 'id'> | null): WorkspaceState {
  const ws = restored ?? defaultWorkspace();
  return {
    schemaText: ws.schema,
    queryText: ws.currentQuery,
    seedConfig: ws.seedConfig,
    seedOnApply: ws.schemaOptions.seedOnApply,
    engineStatus: 'initializing',
    initMs: null,
    sqliteVersion: null,
    engineError: null,
    stall: null,
    busy: null,
    progress: null,
    metadata: null,
    applied: null,
    seedReport: null,
    schemaError: null,
    queryRun: null,
    queryError: null,
    resultsCleared: null,
    history: [],
    dbDirty: false,
    lastSharedHash: null,
    notices: notice ? [{ ...notice, id: ++noticeId }] : [],
    inspectorTab: 'results',
  };
}

export function toPlaygroundState(s: WorkspaceState): PlaygroundState {
  return { version: 1, generatorVersion: GENERATOR_VERSION, schema: s.schemaText, currentQuery: s.queryText, seedConfig: s.seedConfig, schemaOptions: { seedOnApply: s.seedOnApply } };
}

function historyEntry(sql: string, ok: boolean, durationMs: number, rowCount: number | null): QueryHistoryEntry {
  return { id: ++historyId, sql, executedAt: Date.now(), ok, durationMs, rowCount };
}

const pushHistory = (h: readonly QueryHistoryEntry[], e: QueryHistoryEntry): QueryHistoryEntry[] => [e, ...h].slice(0, 50);

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'EDIT_SCHEMA':
      return { ...state, schemaText: action.text };
    case 'EDIT_QUERY':
      return { ...state, queryText: action.text };
    case 'SET_SEED_CONFIG':
      return { ...state, seedConfig: { ...state.seedConfig, ...action.patch } };
    case 'SET_SEED_ON_APPLY':
      return { ...state, seedOnApply: action.value };
    case 'ENGINE_INIT_START':
      return { ...state, engineStatus: 'initializing', engineError: null, stall: null };
    case 'ENGINE_READY':
      return { ...state, engineStatus: 'ready', initMs: action.initMs, sqliteVersion: action.version, engineError: null };
    case 'ENGINE_FATAL':
      return { ...state, engineStatus: 'error', engineError: action.error, busy: null, progress: null, stall: null };
    case 'ENGINE_STALL':
      return { ...state, stall: action.stall };
    case 'ENGINE_DISPOSED':
      return { ...state, engineStatus: 'disposed', busy: null, progress: null };
    case 'BUSY':
      return { ...state, busy: action.kind, progress: action.kind ? state.progress : null };
    case 'PROGRESS':
      return { ...state, progress: action.detail };
    case 'SCHEMA_APPLIED':
      return {
        ...state,
        metadata: action.result.metadata,
        seedReport: action.result.seedReport,
        applied: { text: action.text, seed: action.seed, at: Date.now(), result: { statements: action.result.statements, timings: action.result.timings }, roundTripMs: action.roundTripMs },
        schemaError: null,
        dbDirty: false,
        queryRun: null,
        queryError: null,
        resultsCleared: state.queryRun ? 'Previous results were cleared because the database was rebuilt.' : null,
        notices: state.notices.filter((n) => n.action !== 'apply-schema'),
      };
    case 'SCHEMA_FAILED':
      return { ...state, schemaError: action.error };
    case 'QUERY_DONE': {
      const r = action.run.result;
      const last = r.statements[r.statements.length - 1];
      return {
        ...state,
        queryRun: action.run,
        queryError: null,
        resultsCleared: null,
        metadata: r.metadata ?? state.metadata,
        dbDirty: state.dbDirty || r.dataChanged || r.schemaChanged,
        history: pushHistory(state.history, historyEntry(action.run.sql, r.error === null, r.totalExecutionMs, last?.returnsRows ? last.rowCount : null)),
        inspectorTab: state.inspectorTab === 'erd' && !r.schemaChanged ? 'results' : state.inspectorTab,
      };
    }
    case 'QUERY_FAILED':
      return { ...state, queryError: action.error, history: pushHistory(state.history, historyEntry(action.sql, false, 0, null)) };
    case 'HISTORY_CLEAR':
      return { ...state, history: [] };
    case 'RESTORE_WORKSPACE':
      return { ...state, schemaText: action.state.schema, queryText: action.state.currentQuery, seedConfig: action.state.seedConfig, seedOnApply: action.state.schemaOptions.seedOnApply };
    case 'DATABASE_REPLACED':
      return {
        ...state,
        metadata: action.metadata,
        seedReport: null,
        schemaError: null,
        queryRun: null,
        queryError: null,
        resultsCleared: action.reason,
        dbDirty: action.dirty,
        schemaText: action.schemaText ?? state.schemaText,
        applied: action.schemaText !== undefined ? { text: action.schemaText, seed: null, at: Date.now(), result: { statements: [], timings: { schemaMs: 0, inspectMs: action.metadata.inspectionMs, seedMs: null, totalMs: 0 } }, roundTripMs: 0 } : null,
      };
    case 'SHARED':
      return { ...state, lastSharedHash: action.hash };
    case 'NOTICE':
      return { ...state, notices: [...state.notices.filter((n) => n.message !== action.notice.message), { ...action.notice, id: ++noticeId }].slice(-4) };
    case 'DISMISS_NOTICE':
      return { ...state, notices: state.notices.filter((n) => n.id !== action.id) };
    case 'SET_TAB':
      return { ...state, inspectorTab: action.tab };
  }
}

export function displayStatus(s: WorkspaceState): EngineStatus {
  return s.engineStatus === 'ready' && s.busy ? 'executing' : s.engineStatus;
}
