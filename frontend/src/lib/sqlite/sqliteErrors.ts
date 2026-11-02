import type { ErrorCategory, OperationPhase, SQLiteErrorInfo } from '@/types/query';

/** Thrown inside the engine; carries a normalized, user-presentable error. */
export class EngineError extends Error {
  constructor(readonly info: SQLiteErrorInfo) {
    super(info.message);
    this.name = 'EngineError';
  }
}

export interface ErrorContext {
  readonly phase?: OperationPhase;
  readonly statement?: string;
  readonly statementIndex?: number;
  readonly line?: number;
  readonly column?: number;
}

interface Rule {
  readonly pattern: RegExp;
  readonly category: ErrorCategory;
  readonly code?: string;
  readonly hint?: string;
}

const RULES: readonly Rule[] = [
  { pattern: /syntax error|unrecognized token|incomplete input/i, category: 'syntax', code: 'SQLITE_ERROR_SYNTAX' },
  { pattern: /FOREIGN KEY constraint failed/i, category: 'constraint', code: 'SQLITE_CONSTRAINT_FOREIGNKEY', hint: 'A referenced parent row does not exist (or a parent row is still referenced).' },
  { pattern: /UNIQUE constraint failed/i, category: 'constraint', code: 'SQLITE_CONSTRAINT_UNIQUE' },
  { pattern: /NOT NULL constraint failed/i, category: 'constraint', code: 'SQLITE_CONSTRAINT_NOTNULL' },
  { pattern: /CHECK constraint failed/i, category: 'constraint', code: 'SQLITE_CONSTRAINT_CHECK' },
  { pattern: /PRIMARY KEY|datatype mismatch|constraint failed/i, category: 'constraint', code: 'SQLITE_CONSTRAINT' },
  { pattern: /no such module/i, category: 'schema', code: 'SQLITE_UNSUPPORTED', hint: 'This virtual-table module is not compiled into the bundled sql.js build (FTS3 is available; FTS5, R*Tree and extensions loading are not).' },
  { pattern: /no such (table|column|function|index|view|trigger)|has no column named|ambiguous column/i, category: 'schema', code: 'SQLITE_ERROR_MISSING_OBJECT' },
  { pattern: /already exists|malformed|duplicate column|cannot add|cannot drop|AUTOINCREMENT is only allowed|table .* has more than one primary key/i, category: 'schema', code: 'SQLITE_ERROR_SCHEMA' },
  { pattern: /out of memory|too big|too many|string or blob too big|database or disk is full/i, category: 'resource', code: 'SQLITE_RESOURCE' },
  { pattern: /transaction|cannot (start|commit|rollback)/i, category: 'execution', code: 'SQLITE_ERROR_TRANSACTION' },
  { pattern: /not a database|file is not a database|database disk image is malformed/i, category: 'validation', code: 'SQLITE_NOTADB' },
];

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}

/** Locates the token named in `near "..."` inside the failing statement to refine line/column. */
function refinePosition(message: string, ctx: ErrorContext): { line?: number; column?: number } {
  const near = /near "([^"]+)"/.exec(message);
  if (!near || !ctx.statement || ctx.line === undefined) return { line: ctx.line, column: ctx.column };
  const idx = ctx.statement.indexOf(near[1] as string);
  if (idx < 0) return { line: ctx.line, column: ctx.column };
  const before = ctx.statement.slice(0, idx).split('\n');
  const extraLines = before.length - 1;
  const lastLen = before[before.length - 1]?.length ?? 0;
  return {
    line: ctx.line + extraLines,
    column: extraLines === 0 ? (ctx.column ?? 1) + lastLen : lastLen + 1,
  };
}

export function normalizeError(err: unknown, ctx: ErrorContext = {}): SQLiteErrorInfo {
  if (err instanceof EngineError) return { ...stripUndefined(ctx), ...err.info };
  const message = messageOf(err).replace(/\s+/g, ' ').trim().slice(0, 2000);
  const rule = RULES.find((r) => r.pattern.test(message));
  const pos = refinePosition(message, ctx);
  return stripUndefined({
    category: rule?.category ?? 'execution',
    message,
    phase: ctx.phase,
    statement: ctx.statement?.slice(0, 4000),
    statementIndex: ctx.statementIndex,
    line: pos.line,
    column: pos.column,
    code: rule?.code,
    hint: rule?.hint,
    recoverable: rule?.category !== 'resource',
  });
}

export function engineError(category: ErrorCategory, message: string, extra: Partial<SQLiteErrorInfo> = {}): EngineError {
  return new EngineError({ category, message, recoverable: true, ...extra });
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
