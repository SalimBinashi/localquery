export type TokenType = 'word' | 'quoted' | 'string' | 'number' | 'blob' | 'param' | 'punct';

export interface Token {
  readonly type: TokenType;
  /** Raw source text. */
  readonly text: string;
  /** Unescaped value for quoted identifiers and strings, upper-case for words. */
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export class SqlLexError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
    this.name = 'SqlLexError';
  }
}

const WORD_START = /[A-Za-z_\u0080-\uffff]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-\uffff]/;
const NUMBER = /^(?:0[xX][0-9a-fA-F]+|(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/;
const MULTI_PUNCT = ['->>', '||', '<=', '>=', '==', '!=', '<>', '<<', '>>', '->'];

function readDelimited(sql: string, start: number, close: string, doubled: boolean): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === close) {
      if (doubled && sql[i + 1] === close) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  throw new SqlLexError(`Unterminated ${close === "'" ? 'string literal' : 'quoted identifier'}`, start);
}

/** Lexes SQLite SQL; comments and whitespace are dropped. */
export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (type: TokenType, start: number, end: number, value?: string): void => {
    const text = sql.slice(start, end);
    tokens.push({ type, text, value: value ?? text, start, end });
    i = end;
  };
  while (i < sql.length) {
    const c = sql[i] as string;
    const next = sql[i + 1];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '-' && next === '-') {
      const e = sql.indexOf('\n', i);
      i = e === -1 ? sql.length : e + 1;
    } else if (c === '/' && next === '*') {
      const e = sql.indexOf('*/', i + 2);
      i = e === -1 ? sql.length : e + 2; // SQLite accepts an unterminated comment at end of input
    } else if ((c === 'x' || c === 'X') && next === "'") {
      const end = readDelimited(sql, i + 1, "'", false);
      push('blob', i, end);
    } else if (c === "'") {
      const end = readDelimited(sql, i, "'", true);
      push('string', i, end, sql.slice(i + 1, end - 1).replace(/''/g, "'"));
    } else if (c === '"' || c === '`') {
      const end = readDelimited(sql, i, c, true);
      push('quoted', i, end, sql.slice(i + 1, end - 1).split(c + c).join(c));
    } else if (c === '[') {
      const e = sql.indexOf(']', i);
      if (e === -1) throw new SqlLexError('Unterminated [identifier]', i);
      push('quoted', i, e + 1, sql.slice(i + 1, e));
    } else if (/\d/.test(c) || (c === '.' && next !== undefined && /\d/.test(next))) {
      const m = NUMBER.exec(sql.slice(i));
      push('number', i, i + (m ? m[0].length : 1));
    } else if (WORD_START.test(c)) {
      let e = i + 1;
      while (e < sql.length && WORD_PART.test(sql[e] as string)) e++;
      push('word', i, e, sql.slice(i, e).toUpperCase());
    } else if (c === '?' || ((c === ':' || c === '@' || c === '$') && next !== undefined && WORD_START.test(next))) {
      let e = i + 1;
      while (e < sql.length && WORD_PART.test(sql[e] as string)) e++;
      push('param', i, e);
    } else {
      const multi = MULTI_PUNCT.find((p) => sql.startsWith(p, i));
      push('punct', i, i + (multi ? multi.length : 1));
    }
  }
  return tokens;
}

export function isWord(token: Token | undefined, ...words: string[]): boolean {
  return token !== undefined && token.type === 'word' && words.includes(token.value);
}

export function isPunct(token: Token | undefined, text: string): boolean {
  return token !== undefined && token.type === 'punct' && token.text === text;
}

/** Identifier value of a name token (bare word keeps original case). */
export function identifierValue(token: Token | undefined): string | null {
  if (!token) return null;
  if (token.type === 'word') return token.text;
  if (token.type === 'quoted' || token.type === 'string') return token.value;
  return null;
}

/** Index of the token closing the parenthesis opened at `openIndex`. */
export function findClosingParen(tokens: readonly Token[], openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i++) {
    if (isPunct(tokens[i], '(')) depth++;
    else if (isPunct(tokens[i], ')')) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function lineColumnAt(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, Math.max(0, offset));
  const lines = before.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}
