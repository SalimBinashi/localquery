import path from 'node:path';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { SQLiteEngine } from '@/lib/sqlite/SQLiteEngine';

let sqlPromise: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({ locateFile: (f: string) => path.resolve(process.cwd(), 'node_modules/sql.js/dist', f) });
  return sqlPromise;
}

export async function createEngine(): Promise<SQLiteEngine> {
  const engine = new SQLiteEngine(await loadSqlJs());
  engine.initialize();
  return engine;
}
