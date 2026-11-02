import type { ResultLimits } from '@/types/query';

export const RESULT_LIMITS: ResultLimits = {
  maxRetainedRows: 5000,
  maxPayloadBytes: 8 * 1024 * 1024,
  maxStatements: 200,
};

export const DISPLAY_LIMITS = {
  maxVisibleColumns: 100,
  maxCellChars: 200,
  pageSizes: [50, 100, 250] as const,
  maxConcurrentQueries: 1,
};

export const SEED_LIMITS = {
  maxTotalRows: 20000,
  maxTables: 60,
  maxColumnsPerTable: 120,
  timeoutMs: 20000,
  maxAttemptsPerRow: 8,
  maxFailuresPerTable: 200,
  maxTextLength: 2000,
  nullRate: 0.12,
  parentPoolLimit: 10000,
};

export const INPUT_LIMITS = {
  maxSchemaChars: 100_000,
  maxQueryChars: 100_000,
  maxImportBytes: 50 * 1024 * 1024,
};

export const URL_LIMITS = {
  maxUrlLength: 8000,
  warnUrlLength: 6000,
  /** Hashes longer than this are rejected before decompression (bounds worst-case LZ expansion). */
  maxHashLength: 16000,
  maxDecodedChars: 220_000,
  maxSchemaChars: 100_000,
  maxQueryChars: 50_000,
  maxTables: 200,
};

/** A worker request running longer than this is reported as stalled. */
export const WORKER_STALL_MS = 15000;

export const GENERATOR_VERSION = 1;
