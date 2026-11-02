import type { DatabaseMetadata } from '@/types/database';
import type { QueryExecutionResult, ResultLimits, SQLiteErrorInfo } from '@/types/query';
import type { SeedConfig } from '@/types/workspace';
import type { SeedRecord, SeedResult } from '@/lib/seeding/seedTypes';
import { EngineError } from '@/lib/sqlite/sqliteErrors';
import { isWorkerResponse, type AsyncSQLiteEngine, type ImportResult, type InitResult, type SchemaExecutionResult, type WorkerProgress, type WorkerRequestPayloads, type WorkerRequestType, type WorkerResults } from '@/lib/sqlite/sqliteTypes';
import { WORKER_STALL_MS } from '@/lib/limits';

export interface WorkerClientEvents {
  onProgress?: (progress: WorkerProgress) => void;
  /** Worker crashed or failed to load. All pending requests are rejected. */
  onFatal?: (error: SQLiteErrorInfo) => void;
  /** A request has been running longer than the stall threshold (null when it settles). */
  onStall?: (info: { type: WorkerRequestType; elapsedMs: number } | null) => void;
}

interface Pending {
  readonly type: WorkerRequestType;
  readonly startedAt: number;
  resolve(value: unknown): void;
  reject(error: EngineError): void;
}

/** Main-thread proxy for the SQLite worker. Owns request IDs and drops stale/unknown responses. */
export class SQLiteWorkerClient implements AsyncSQLiteEngine {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private stallTimer: ReturnType<typeof setInterval> | null = null;
  private stalled = false;
  private disposed = false;

  constructor(
    private readonly createWorker: () => Worker,
    private readonly events: WorkerClientEvents = {},
    private readonly stallMs: number = WORKER_STALL_MS,
  ) {}

  private ensureWorker(): Worker {
    if (this.disposed) throw new EngineError({ category: 'internal', message: 'The SQLite engine has been disposed.', recoverable: true });
    if (this.worker) return this.worker;
    const w = this.createWorker();
    w.addEventListener('message', (e: MessageEvent<unknown>) => this.onMessage(e.data));
    w.addEventListener('error', (e: ErrorEvent) => {
      e.preventDefault();
      this.fail({ category: 'initialization', message: `SQLite worker failed: ${e.message || 'script or WebAssembly could not be loaded'}`, phase: 'worker', recoverable: true });
    });
    w.addEventListener('messageerror', () => this.fail({ category: 'internal', message: 'The worker sent a message that could not be deserialized.', phase: 'worker', recoverable: true }));
    this.worker = w;
    this.stallTimer = setInterval(() => this.checkStall(), 1000);
    return w;
  }

  private onMessage(data: unknown): void {
    if (!isWorkerResponse(data)) return;
    if (data.kind === 'progress') {
      if (this.pending.has(data.id)) this.events.onProgress?.(data);
      return;
    }
    const p = this.pending.get(data.id);
    if (!p) return; // stale response from a terminated or superseded request
    this.pending.delete(data.id);
    if (data.kind === 'success') p.resolve(data.result);
    else p.reject(new EngineError(data.error));
    this.checkStall();
  }

  private checkStall(): void {
    const oldest = [...this.pending.values()].sort((a, b) => a.startedAt - b.startedAt)[0];
    const elapsed = oldest ? performance.now() - oldest.startedAt : 0;
    if (oldest && elapsed > this.stallMs) {
      this.stalled = true;
      this.events.onStall?.({ type: oldest.type, elapsedMs: elapsed });
    } else if (this.stalled) {
      this.stalled = false;
      this.events.onStall?.(null);
    }
  }

  private fail(error: SQLiteErrorInfo): void {
    this.rejectAll(error);
    this.teardown();
    this.events.onFatal?.(error);
  }

  private rejectAll(error: SQLiteErrorInfo): void {
    for (const p of this.pending.values()) p.reject(new EngineError(error));
    this.pending.clear();
  }

  private teardown(): void {
    if (this.stallTimer) clearInterval(this.stallTimer);
    this.stallTimer = null;
    this.worker?.terminate();
    this.worker = null;
    if (this.stalled) this.events.onStall?.(null);
    this.stalled = false;
  }

  private request<K extends WorkerRequestType>(type: K, payload: WorkerRequestPayloads[K], transfer: Transferable[] = []): Promise<WorkerResults[K]> {
    return new Promise<WorkerResults[K]>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.ensureWorker();
      } catch (e) {
        reject(e);
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { type, startedAt: performance.now(), resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, type, payload }, transfer);
    });
  }

  get busy(): boolean {
    return this.pending.size > 0;
  }

  initialize(): Promise<InitResult> {
    return this.request('INIT', {});
  }
  executeSchema(ddl: string, seed: SeedConfig | null): Promise<SchemaExecutionResult> {
    return this.request('APPLY_SCHEMA', { ddl, seed });
  }
  seedData(table: string, records: readonly SeedRecord[]): Promise<SeedResult> {
    return this.request('INSERT_RECORDS', { table, records });
  }
  generateSeed(seed: SeedConfig): Promise<WorkerResults['SEED_DATABASE']> {
    return this.request('SEED_DATABASE', { seed });
  }
  runQuery(sql: string, limits: ResultLimits): Promise<QueryExecutionResult> {
    return this.request('EXECUTE_QUERY', { sql, limits });
  }
  getSchemaMetadata(): Promise<DatabaseMetadata> {
    return this.request('GET_SCHEMA_METADATA', {});
  }
  resetDatabase(): Promise<DatabaseMetadata> {
    return this.request('RESET_DATABASE', {});
  }
  exportDatabase(): Promise<WorkerResults['EXPORT_DATABASE']> {
    return this.request('EXPORT_DATABASE', {});
  }
  exportSqlDump(): Promise<WorkerResults['EXPORT_SQL_DUMP']> {
    return this.request('EXPORT_SQL_DUMP', {});
  }
  importDatabase(bytes: Uint8Array): Promise<ImportResult> {
    return this.request('IMPORT_DATABASE', { bytes });
  }

  /** Hard stop for a runaway statement: terminates the worker (its database is lost) and starts a new one. */
  async restart(): Promise<InitResult> {
    this.rejectAll({ category: 'cancelled', message: 'The operation was cancelled because the worker was terminated.', recoverable: true });
    this.teardown();
    return this.initialize();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.rejectAll({ category: 'cancelled', message: 'The engine was disposed.', recoverable: true });
    this.teardown();
    this.disposed = true;
  }
}
