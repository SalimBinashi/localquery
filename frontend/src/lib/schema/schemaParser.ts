import type { ParsedColumn, ParsedCreateTable, ParsedReference, ParsedTableConstraint, StatementKind } from '@/lib/schema/schemaTypes';
import { findClosingParen, identifierValue, isPunct, isWord, tokenize, type Token } from '@/lib/schema/sqlTokenizer';

const COLUMN_CONSTRAINT_START = ['CONSTRAINT', 'PRIMARY', 'NOT', 'NULL', 'UNIQUE', 'CHECK', 'DEFAULT', 'COLLATE', 'REFERENCES', 'GENERATED', 'AS'];
const TABLE_CONSTRAINT_START = ['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN'];

export class SchemaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaParseError';
  }
}

/** Splits tokens[from..to) on depth-0 commas. */
function splitTopLevel(tokens: readonly Token[], from: number, to: number): Token[][] {
  const parts: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (let i = from; i < to; i++) {
    const t = tokens[i] as Token;
    if (isPunct(t, '(')) depth++;
    if (isPunct(t, ')')) depth--;
    if (depth === 0 && isPunct(t, ',')) {
      parts.push(current);
      current = [];
    } else current.push(t);
  }
  if (current.length) parts.push(current);
  return parts;
}

function sourceSlice(sql: string, tokens: readonly Token[], from: number, toInclusive: number): string {
  const a = tokens[from];
  const b = tokens[toInclusive];
  return a && b ? sql.slice(a.start, b.end) : '';
}

/** Reads "( expr )" starting at `open`; returns inner source and next index. */
function readParenExpr(sql: string, toks: readonly Token[], open: number): { expr: string; next: number } {
  const close = findClosingParen(toks, open);
  if (close < 0) throw new SchemaParseError('Unbalanced parentheses');
  return { expr: close > open + 1 ? sourceSlice(sql, toks, open + 1, close - 1) : '', next: close + 1 };
}

function readNameList(toks: readonly Token[], open: number): { names: string[]; next: number } {
  const close = findClosingParen(toks, open);
  if (close < 0) throw new SchemaParseError('Unbalanced column list');
  const names = splitTopLevel(toks, open + 1, close)
    .map((part) => identifierValue(part[0]))
    .filter((n): n is string => n !== null);
  return { names, next: close + 1 };
}

function skipConflictClause(toks: readonly Token[], i: number): number {
  return isWord(toks[i], 'ON') && isWord(toks[i + 1], 'CONFLICT') ? i + 3 : i;
}

function readAction(toks: readonly Token[], i: number): { action: string; next: number } {
  if (isWord(toks[i], 'SET') || isWord(toks[i], 'NO')) return { action: `${toks[i]?.value} ${toks[i + 1]?.value ?? ''}`.trim(), next: i + 2 };
  return { action: toks[i]?.value ?? '', next: i + 1 };
}

function readReferences(toks: readonly Token[], i: number): { ref: ParsedReference; next: number } {
  let j = i + 1;
  let table = identifierValue(toks[j]) ?? '';
  j++;
  if (isPunct(toks[j], '.')) {
    table = identifierValue(toks[j + 1]) ?? table;
    j += 2;
  }
  let columns: string[] = [];
  if (isPunct(toks[j], '(')) {
    const list = readNameList(toks, j);
    columns = list.names;
    j = list.next;
  }
  let onDelete: string | null = null;
  let onUpdate: string | null = null;
  let deferrable = false;
  for (;;) {
    if (isWord(toks[j], 'ON') && isWord(toks[j + 1], 'DELETE', 'UPDATE')) {
      const which = toks[j + 1]?.value;
      const r = readAction(toks, j + 2);
      if (which === 'DELETE') onDelete = r.action;
      else onUpdate = r.action;
      j = r.next;
    } else if (isWord(toks[j], 'MATCH')) j += 2;
    else if (isWord(toks[j], 'NOT') && isWord(toks[j + 1], 'DEFERRABLE')) j += 2;
    else if (isWord(toks[j], 'DEFERRABLE')) {
      j++;
      if (isWord(toks[j], 'INITIALLY')) {
        deferrable = isWord(toks[j + 1], 'DEFERRED');
        j += 2;
      }
    } else break;
  }
  return { ref: { table, columns, onDelete, onUpdate, deferrable }, next: j };
}

function readDefault(sql: string, toks: readonly Token[], i: number): { expr: string; next: number } {
  const t = toks[i];
  if (isPunct(t, '(')) {
    const r = readParenExpr(sql, toks, i);
    return { expr: `(${r.expr})`, next: r.next };
  }
  if ((isPunct(t, '-') || isPunct(t, '+')) && toks[i + 1]) return { expr: `${t?.text}${toks[i + 1]?.text}`, next: i + 2 };
  return { expr: t?.text ?? '', next: i + 1 };
}

function parseColumn(sql: string, toks: Token[], warnings: string[]): ParsedColumn {
  const name = identifierValue(toks[0]);
  if (name === null) throw new SchemaParseError(`Invalid column definition near "${toks[0]?.text ?? ''}"`);
  let i = 1;
  const typeStart = i;
  while (i < toks.length && !(toks[i]?.type === 'word' && COLUMN_CONSTRAINT_START.includes((toks[i] as Token).value))) {
    i = isPunct(toks[i], '(') ? findClosingParen(toks, i) + 1 : i + 1;
    if (i <= 0) throw new SchemaParseError(`Unbalanced type declaration for column "${name}"`);
  }
  const type = i > typeStart ? sourceSlice(sql, toks, typeStart, i - 1) : '';
  const col = { notNull: false, primaryKey: false, autoIncrement: false, unique: false, defaultExpression: null as string | null, checks: [] as string[], references: null as ParsedReference | null, generated: null as ParsedColumn['generated'], collate: null as string | null };
  while (i < toks.length) {
    const t = toks[i];
    if (isWord(t, 'CONSTRAINT')) i += 2;
    else if (isWord(t, 'PRIMARY')) {
      col.primaryKey = true;
      i += 2;
      if (isWord(toks[i], 'ASC', 'DESC')) i++;
      i = skipConflictClause(toks, i);
      if (isWord(toks[i], 'AUTOINCREMENT')) {
        col.autoIncrement = true;
        i++;
      }
    } else if (isWord(t, 'NOT') && isWord(toks[i + 1], 'NULL')) {
      col.notNull = true;
      i = skipConflictClause(toks, i + 2);
    } else if (isWord(t, 'NULL')) i++;
    else if (isWord(t, 'UNIQUE')) {
      col.unique = true;
      i = skipConflictClause(toks, i + 1);
    } else if (isWord(t, 'CHECK') && isPunct(toks[i + 1], '(')) {
      const r = readParenExpr(sql, toks, i + 1);
      col.checks.push(r.expr);
      i = r.next;
    } else if (isWord(t, 'DEFAULT')) {
      const r = readDefault(sql, toks, i + 1);
      col.defaultExpression = r.expr;
      i = r.next;
    } else if (isWord(t, 'COLLATE')) {
      col.collate = identifierValue(toks[i + 1]);
      i += 2;
    } else if (isWord(t, 'REFERENCES')) {
      const r = readReferences(toks, i);
      col.references = r.ref;
      i = r.next;
    } else if (isWord(t, 'GENERATED') || isWord(t, 'AS')) {
      while (i < toks.length && !isPunct(toks[i], '(')) i++;
      const r = readParenExpr(sql, toks, i);
      i = r.next;
      const stored = isWord(toks[i], 'STORED');
      if (isWord(toks[i], 'STORED', 'VIRTUAL')) i++;
      col.generated = { expression: r.expr, stored };
    } else {
      warnings.push(`Unrecognized token "${t?.text ?? ''}" in column "${name}" was ignored by the inspector (SQLite accepted it).`);
      i++;
    }
  }
  return { name, type, ...col };
}

function parseTableConstraint(sql: string, toks: Token[]): ParsedTableConstraint | null {
  let i = 0;
  let name: string | null = null;
  if (isWord(toks[0], 'CONSTRAINT')) {
    name = identifierValue(toks[1]);
    i = 2;
  }
  const t = toks[i];
  if (isWord(t, 'PRIMARY')) return { kind: 'primary-key', name, columns: readNameList(toks, i + 2).names };
  if (isWord(t, 'UNIQUE')) return { kind: 'unique', name, columns: readNameList(toks, i + 1).names };
  if (isWord(t, 'CHECK')) return { kind: 'check', name, expression: readParenExpr(sql, toks, i + 1).expr };
  if (isWord(t, 'FOREIGN')) {
    const cols = readNameList(toks, i + 2);
    if (!isWord(toks[cols.next], 'REFERENCES')) throw new SchemaParseError('FOREIGN KEY without REFERENCES');
    return { kind: 'foreign-key', name, columns: cols.names, references: readReferences(toks, cols.next).ref };
  }
  return null;
}

/** Conservative CREATE TABLE parser; SQLite remains the authority for validation and metadata. */
export function parseCreateTable(sql: string): ParsedCreateTable {
  const toks = tokenize(sql);
  let i = 0;
  if (!isWord(toks[i], 'CREATE')) throw new SchemaParseError('Not a CREATE TABLE statement');
  i++;
  const temporary = isWord(toks[i], 'TEMP', 'TEMPORARY');
  if (temporary) i++;
  if (!isWord(toks[i], 'TABLE')) throw new SchemaParseError('Not a CREATE TABLE statement (CREATE VIRTUAL TABLE is handled separately)');
  i++;
  const ifNotExists = isWord(toks[i], 'IF') && isWord(toks[i + 1], 'NOT') && isWord(toks[i + 2], 'EXISTS');
  if (ifNotExists) i += 3;
  let schema: string | null = null;
  let name = identifierValue(toks[i]);
  i++;
  if (isPunct(toks[i], '.')) {
    schema = name;
    name = identifierValue(toks[i + 1]);
    i += 2;
  }
  if (!name) throw new SchemaParseError('Missing table name');
  const base = { schema, name, temporary, ifNotExists };
  if (isWord(toks[i], 'AS')) return { ...base, asSelect: true, withoutRowid: false, strict: false, columns: [], constraints: [], warnings: ['CREATE TABLE … AS SELECT: columns come from SQLite metadata only.'] };
  if (!isPunct(toks[i], '(')) throw new SchemaParseError(`Expected "(" after table name ${name}`);
  const close = findClosingParen(toks, i);
  if (close < 0) throw new SchemaParseError(`Unbalanced parentheses in table ${name}`);
  const warnings: string[] = [];
  const columns: ParsedColumn[] = [];
  const constraints: ParsedTableConstraint[] = [];
  for (const part of splitTopLevel(toks, i + 1, close)) {
    if (part.length === 0) throw new SchemaParseError(`Empty definition in table ${name}`);
    const head = part[0] as Token;
    const isConstraint = head.type === 'word' && TABLE_CONSTRAINT_START.includes(head.value) && !(head.value === 'PRIMARY' && !isWord(part[1], 'KEY'));
    if (isConstraint) {
      const c = parseTableConstraint(sql, part);
      if (c) constraints.push(c);
    } else columns.push(parseColumn(sql, part, warnings));
  }
  const options = toks.slice(close + 1).map((t) => t.value);
  return { ...base, asSelect: false, withoutRowid: options.includes('ROWID'), strict: options.includes('STRICT'), columns, constraints, warnings };
}

export function classifyStatementKind(sql: string): StatementKind {
  let toks: Token[];
  try {
    toks = tokenize(sql);
  } catch {
    return 'other';
  }
  const [a, b, c] = toks;
  if (isWord(a, 'CREATE')) {
    const next = isWord(b, 'TEMP', 'TEMPORARY', 'UNIQUE') ? c : b;
    if (isWord(next, 'TABLE')) return 'create-table';
    if (isWord(next, 'VIRTUAL')) return 'create-virtual-table';
    if (isWord(next, 'INDEX')) return 'create-index';
    if (isWord(next, 'VIEW')) return 'create-view';
    if (isWord(next, 'TRIGGER')) return 'create-trigger';
    return 'other';
  }
  if (isWord(a, 'ALTER')) return 'alter';
  if (isWord(a, 'DROP')) return 'drop';
  if (isWord(a, 'INSERT', 'UPDATE', 'DELETE', 'REPLACE')) return 'dml';
  if (isWord(a, 'SELECT', 'WITH', 'VALUES')) return 'select';
  if (isWord(a, 'PRAGMA')) return 'pragma';
  if (isWord(a, 'BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'SAVEPOINT', 'RELEASE')) return 'transaction';
  return 'other';
}

/** Names of columns (from `candidates`) referenced as identifiers in an expression. */
export function referencedColumns(expression: string, candidates: readonly string[]): string[] {
  let toks: Token[];
  try {
    toks = tokenize(expression);
  } catch {
    return [];
  }
  const lower = new Map(candidates.map((c) => [c.toLowerCase(), c]));
  const found = new Set<string>();
  for (const t of toks) {
    if (t.type !== 'word' && t.type !== 'quoted') continue;
    const hit = lower.get((t.type === 'word' ? t.text : t.value).toLowerCase());
    if (hit) found.add(hit);
  }
  return [...found];
}
