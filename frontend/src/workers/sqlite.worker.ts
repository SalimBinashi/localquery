import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SQLiteEngine } from '@/lib/sqlite/SQLiteEngine';
import { engineError, normalizeError } from '@/lib/sqlite/sqliteErrors';
import { isWorkerRequest, type WorkerRequest, type WorkerResponse, type WorkerResults } from '@/lib/sqlite/sqliteTypes';

interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

const scope = self as unknown as WorkerScope;

let engine: SQLiteEngine | null = null;
let initPromise: Promise<SQLiteEngine> | null = null;

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(msg, transfer);
}

async function ensureEngine(): Promise<SQLiteEngine> {
  if (engine) return engine;
  initPromise ??= initSqlJs({ locateFile: () => wasmUrl }).then((SQL) => {
    const e = new SQLiteEngine(SQL);
    e.initialize();
    engine = e;
    return e;
  });
  return initPromise;
}

function requireEngine(): SQLiteEngine {
  if (!engine) throw engineError('initialization', 'SQLite has not been initialized yet.', { phase: 'init' });
  return engine;
}

async function handle(req: WorkerRequest): Promise<WorkerResults[WorkerRequest['type']]> {
  const progress = (phase: 'schema' | 'inspect' | 'seed' | 'validate' | 'query', detail: string): void => post({ id: req.id, kind: 'progress', phase, detail });
  switch (req.type) {
    case 'INIT': {
      const t0 = performance.now();
      const e = await ensureEngine();
      return { durationMs: performance.now() - t0, sqliteVersion: e.sqliteVersion };
    }
    case 'APPLY_SCHEMA':
      return requireEngine().executeSchema(req.payload.ddl, req.payload.seed, progress);
    case 'SEED_DATABASE':
      return requireEngine().generateSeed(req.payload.seed);
    case 'INSERT_RECORDS':
      return requireEngine().seedData(req.payload.table, req.payload.records);
    case 'EXECUTE_QUERY':
      return requireEngine().runQuery(req.payload.sql, req.payload.limits);
    case 'GET_SCHEMA_METADATA':
      return requireEngine().getSchemaMetadata();
    case 'RESET_DATABASE':
      return requireEngine().resetDatabase();
    case 'EXPORT_DATABASE': {
      const t0 = performance.now();
      return { bytes: requireEngine().exportDatabase(), durationMs: performance.now() - t0 };
    }
    case 'EXPORT_SQL_DUMP': {
      const t0 = performance.now();
      return { sql: requireEngine().exportSqlDump(), durationMs: performance.now() - t0 };
    }
    case 'IMPORT_DATABASE':
      return requireEngine().importDatabase(req.payload.bytes);
    case 'DISPOSE':
      engine?.dispose();
      engine = null;
      initPromise = null;
      return { disposed: true };
  }
}

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
  const data = event.data;
  if (!isWorkerRequest(data)) {
    const id = typeof data === 'object' && data !== null && typeof (data as { id?: unknown }).id === 'number' ? (data as { id: number }).id : -1;
    post({ id, kind: 'failure', error: { category: 'internal', message: 'Malformed worker message rejected.', phase: 'worker', recoverable: true } });
    return;
  }
  handle(data).then(
    (result) => {
      const transfer = data.type === 'EXPORT_DATABASE' && 'bytes' in result && result.bytes instanceof Uint8Array ? [result.bytes.buffer] : [];
      post({ id: data.id, kind: 'success', type: data.type, result } as WorkerResponse, transfer);
    },
    (err: unknown) => {
      const phase = data.type === 'INIT' ? 'init' : undefined;
      const info = normalizeError(err, phase ? { phase } : {});
      post({ id: data.id, kind: 'failure', error: data.type === 'INIT' ? { ...info, category: 'initialization' } : info });
    },
  );
});
