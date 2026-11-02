import { createContext, useCallback, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { initialState, toPlaygroundState, workspaceReducer, type WorkspaceAction, type WorkspaceState } from '@/app/providers/workspaceReducer';
import { useSQLiteEngine } from '@/hooks/useSQLiteEngine';
import { useUrlState, type ShareOutcome } from '@/hooks/useUrlState';
import { normalizeError } from '@/lib/sqlite/sqliteErrors';
import { readHash, clearHash } from '@/lib/sharing/UrlState';
import { defaultWorkspace } from '@/lib/defaults';
import { RESULT_LIMITS, INPUT_LIMITS } from '@/lib/limits';
import { downloadBlob, timestampedName } from '@/lib/utils/download';
import type { SQLiteWorkerClient } from '@/lib/sqlite/SQLiteWorkerClient';

export interface WorkspaceActions {
  applySchema(): Promise<void>;
  runQuery(): Promise<void>;
  share(): ShareOutcome;
  resetWorkspace(): Promise<void>;
  exportDatabase(): Promise<void>;
  exportSqlDump(): Promise<void>;
  importDatabase(file: File): Promise<void>;
  restartEngine(): Promise<void>;
}

export interface WorkspaceContextValue {
  readonly state: WorkspaceState;
  readonly dispatch: React.Dispatch<WorkspaceAction>;
  readonly actions: WorkspaceActions;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function bootState(): WorkspaceState {
  const decoded = readHash();
  if (decoded.status === 'ok') return initialState(decoded.state, { kind: 'info', message: 'Workspace restored from the link. The database is not built yet — apply the schema to reconstruct it. The query will not run until you run it.', action: 'apply-schema' });
  if (decoded.status === 'invalid') return initialState(null, { kind: 'warning', message: `The shared link was rejected: ${decoded.reason} The default example workspace was loaded instead.` });
  return initialState(null, null);
}

export function WorkspaceProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, bootState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const generation = useRef(0);
  const autoApplyDefault = useRef(readHash().status !== 'ok');

  const apply = useCallback(async (client: SQLiteWorkerClient, text: string, seedEnabled: boolean): Promise<void> => {
    const s = stateRef.current;
    const gen = ++generation.current;
    const seed = seedEnabled ? { ...s.seedConfig, enabled: true } : null;
    dispatch({ type: 'BUSY', kind: 'schema' });
    const t0 = performance.now();
    try {
      const result = await client.executeSchema(text, seed);
      if (gen !== generation.current) return;
      dispatch({ type: 'SCHEMA_APPLIED', text, seed, result, roundTripMs: performance.now() - t0 });
    } catch (e) {
      if (gen === generation.current) dispatch({ type: 'SCHEMA_FAILED', error: normalizeError(e, { phase: 'schema' }) });
    } finally {
      if (gen === generation.current) dispatch({ type: 'BUSY', kind: null });
    }
  }, []);

  const clientRef = useSQLiteEngine(dispatch, (client) => {
    if (autoApplyDefault.current) {
      autoApplyDefault.current = false;
      void apply(client, stateRef.current.schemaText, stateRef.current.seedOnApply);
    }
  });

  const withClient = useCallback(
    (fn: (c: SQLiteWorkerClient) => Promise<void>, failPhase: 'export' | 'import' | 'query'): Promise<void> => {
      const c = clientRef.current;
      if (!c || stateRef.current.engineStatus !== 'ready') {
        dispatch({ type: 'NOTICE', notice: { kind: 'warning', message: 'SQLite is not ready yet.' } });
        return Promise.resolve();
      }
      return fn(c).catch((e: unknown) => dispatch({ type: 'NOTICE', notice: { kind: 'error', message: normalizeError(e, { phase: failPhase }).message } }));
    },
    [clientRef],
  );

  const share = useUrlState(state, dispatch, toPlaygroundState);

  const actions = useMemo<WorkspaceActions>(
    () => ({
      applySchema: async () => {
        const c = clientRef.current;
        const s = stateRef.current;
        if (!c || s.engineStatus !== 'ready' || s.busy) return;
        await apply(c, s.schemaText, s.seedOnApply && s.seedConfig.enabled);
      },
      runQuery: async () => {
        const c = clientRef.current;
        const s = stateRef.current;
        if (!c || s.engineStatus !== 'ready') {
          dispatch({ type: 'NOTICE', notice: { kind: 'warning', message: 'SQLite is not ready yet — wait for initialization to finish.' } });
          return;
        }
        if (s.busy) return; // one operation at a time; duplicate runs are ignored
        const sql = s.queryText;
        const gen = generation.current;
        dispatch({ type: 'BUSY', kind: 'query' });
        const t0 = performance.now();
        try {
          const result = await c.runQuery(sql, RESULT_LIMITS);
          if (gen !== generation.current) return;
          dispatch({ type: 'QUERY_DONE', run: { sql, result, roundTripMs: performance.now() - t0, finishedAt: Date.now() } });
          dispatch({ type: 'SET_TAB', tab: stateRef.current.inspectorTab === 'details' && !result.error ? 'details' : 'results' });
        } catch (e) {
          if (gen === generation.current) dispatch({ type: 'QUERY_FAILED', error: normalizeError(e, { phase: 'query' }), sql });
        } finally {
          if (gen === generation.current) dispatch({ type: 'BUSY', kind: null });
        }
      },
      share,
      resetWorkspace: async () => {
        const c = clientRef.current;
        generation.current++;
        const def = defaultWorkspace(stateRef.current.seedConfig.randomSeed);
        dispatch({ type: 'RESTORE_WORKSPACE', state: def });
        dispatch({ type: 'HISTORY_CLEAR' });
        clearHash();
        if (!c || stateRef.current.engineStatus !== 'ready') return;
        dispatch({ type: 'BUSY', kind: 'reset' });
        try {
          const metadata = await c.resetDatabase();
          dispatch({ type: 'DATABASE_REPLACED', metadata, reason: 'Workspace reset: a fresh empty database was created.', dirty: false });
        } finally {
          dispatch({ type: 'BUSY', kind: null });
        }
        await apply(c, def.schema, def.schemaOptions.seedOnApply);
      },
      exportDatabase: () =>
        withClient(async (c) => {
          const { bytes } = await c.exportDatabase();
          downloadBlob(bytes as BlobPart, timestampedName('playground', 'sqlite'), 'application/vnd.sqlite3');
        }, 'export'),
      exportSqlDump: () =>
        withClient(async (c) => {
          const { sql } = await c.exportSqlDump();
          downloadBlob(sql, timestampedName('playground-dump', 'sql'), 'application/sql');
        }, 'export'),
      importDatabase: (file: File) =>
        withClient(async (c) => {
          if (file.size > INPUT_LIMITS.maxImportBytes) throw new Error(`File is larger than the ${INPUT_LIMITS.maxImportBytes / 1024 / 1024} MB import limit.`);
          generation.current++;
          dispatch({ type: 'BUSY', kind: 'import' });
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const r = await c.importDatabase(bytes);
            dispatch({ type: 'DATABASE_REPLACED', metadata: r.metadata, reason: `Imported ${file.name}. Its data is not part of share links.`, dirty: true, schemaText: r.schemaSql });
          } finally {
            dispatch({ type: 'BUSY', kind: null });
          }
        }, 'import'),
      restartEngine: async () => {
        const c = clientRef.current;
        if (!c) return;
        generation.current++;
        dispatch({ type: 'BUSY', kind: 'restart' });
        dispatch({ type: 'ENGINE_INIT_START' });
        try {
          const r = await c.restart();
          dispatch({ type: 'ENGINE_READY', initMs: r.durationMs, version: r.sqliteVersion });
          dispatch({ type: 'BUSY', kind: null });
          const applied = stateRef.current.applied;
          dispatch({ type: 'NOTICE', notice: { kind: 'warning', message: 'The SQLite worker was restarted. Changes made after the last schema apply were lost; the last applied schema is being rebuilt.' } });
          if (applied) await apply(c, applied.text, applied.seed !== null);
        } catch (e) {
          dispatch({ type: 'ENGINE_FATAL', error: normalizeError(e, { phase: 'init' }) });
        }
      },
    }),
    [apply, clientRef, share, withClient],
  );

  const value = useMemo(() => ({ state, dispatch, actions }), [state, actions]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
