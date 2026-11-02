import type { CheckConstraint } from '@/types/database';
import type { ColumnHints, PairwiseComparison } from '@/lib/seeding/seedTypes';
import { isPunct, isWord, tokenize, type Token } from '@/lib/schema/sqlTokenizer';

const CMP = ['<', '<=', '>', '>=', '=', '==', '!=', '<>'];
const FLIP: Record<string, string> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };

function splitAnd(tokens: Token[]): Token[][] {
  const parts: Token[][] = [];
  let cur: Token[] = [];
  let depth = 0;
  let pendingBetween = false;
  for (const t of tokens) {
    if (isPunct(t, '(')) depth++;
    if (isPunct(t, ')')) depth--;
    if (depth === 0 && isWord(t, 'BETWEEN')) pendingBetween = true;
    if (depth === 0 && isWord(t, 'AND')) {
      if (pendingBetween) pendingBetween = false;
      else {
        parts.push(cur);
        cur = [];
        continue;
      }
    }
    cur.push(t);
  }
  parts.push(cur);
  return parts.filter((p) => p.length > 0);
}

function stripParens(tokens: Token[]): Token[] {
  let t = tokens;
  while (t.length >= 2 && isPunct(t[0], '(') && isPunct(t[t.length - 1], ')')) t = t.slice(1, -1);
  return t;
}

function readNumber(tokens: Token[], i: number): { value: number; next: number } | null {
  const neg = isPunct(tokens[i], '-');
  const t = tokens[neg ? i + 1 : i];
  if (t?.type !== 'number') return null;
  const v = Number(t.text.replace(/_/g, ''));
  return Number.isFinite(v) ? { value: neg ? -v : v, next: (neg ? i + 2 : i + 1) } : null;
}

const isCol = (t: Token | undefined, col: string): boolean =>
  t !== undefined && (t.type === 'word' || t.type === 'quoted') && (t.type === 'word' ? t.text : t.value).toLowerCase() === col.toLowerCase();

function applyBound(h: ColumnHints, op: string, value: number, target: 'value' | 'length'): boolean {
  const lo = target === 'value' ? 'min' : 'minLength';
  const hi = target === 'value' ? 'max' : 'maxLength';
  const step = target === 'length' ? 1 : 0;
  if (op === '>=' || op === '>') {
    const v = op === '>' && target === 'length' ? value + step : value;
    h[lo] = Math.max(h[lo] ?? -Infinity, v);
    if (op === '>' && target === 'value') h.minExclusive = true;
  } else if (op === '<=' || op === '<') {
    const v = op === '<' && target === 'length' ? value - step : value;
    h[hi] = Math.min(h[hi] ?? Infinity, v);
    if (op === '<' && target === 'value') h.maxExclusive = true;
  } else if (op === '=' || op === '==') {
    if (target === 'value') h.allowed = [value];
    else h.minLength = h.maxLength = value;
  } else return false;
  return true;
}

function interpret(h: ColumnHints, part: Token[], col: string): boolean {
  const p = stripParens(part);
  const [a, b, c] = p;
  if (isCol(a, col) && b?.type === 'punct' && CMP.includes(b.text)) {
    const n = readNumber(p, 2);
    if (n && n.next === p.length) return applyBound(h, b.text, n.value, 'value');
    if ((b.text === '<>' || b.text === '!=') && c?.type === 'string' && c.value === '' && p.length === 3) {
      h.minLength = Math.max(h.minLength ?? 0, 1);
      return true;
    }
    return false;
  }
  const lead = readNumber(p, 0);
  if (lead && p[lead.next]?.type === 'punct' && isCol(p[lead.next + 1], col) && p.length === lead.next + 2) {
    const op = (p[lead.next] as Token).text;
    return applyBound(h, FLIP[op] ?? op, lead.value, 'value');
  }
  if (isCol(a, col) && isWord(b, 'BETWEEN')) {
    const lo = readNumber(p, 2);
    const hi = lo && isWord(p[lo.next], 'AND') ? readNumber(p, lo.next + 1) : null;
    if (lo && hi) return applyBound(h, '>=', lo.value, 'value') && applyBound(h, '<=', hi.value, 'value');
    return false;
  }
  if (isCol(a, col) && isWord(b, 'IN') && isPunct(c, '(')) {
    const values = p.slice(3, -1).filter((t) => !isPunct(t, ','));
    if (values.every((t) => t.type === 'string' || t.type === 'number')) {
      h.allowed = values.map((t) => (t.type === 'number' ? Number(t.text) : t.value));
      return true;
    }
    return false;
  }
  if (isWord(a, 'LENGTH', 'CHAR_LENGTH') && isPunct(b, '(') && isCol(c, col) && isPunct(p[3], ')')) {
    const op = p[4];
    if (isWord(op, 'BETWEEN')) {
      const lo = readNumber(p, 5);
      const hi = lo ? readNumber(p, lo.next + 1) : null;
      return Boolean(lo && hi && applyBound(h, '>=', lo.value, 'length') && applyBound(h, '<=', hi.value, 'length'));
    }
    const n = readNumber(p, 5);
    return Boolean(op?.type === 'punct' && n && applyBound(h, op.text, n.value, 'length'));
  }
  if (isCol(a, col) && (isWord(b, 'IS', 'NOT') || isWord(b, 'LIKE', 'GLOB', 'REGEXP'))) return isWord(b, 'IS', 'NOT');
  if (isWord(a, 'TYPEOF')) return true;
  return false;
}

/** Derives generation hints from CHECK constraints touching `column`. Uninterpretable parts are listed, not guessed. */
export function hintsForColumn(column: string, checks: readonly CheckConstraint[]): ColumnHints {
  const hints: ColumnHints = { unsupported: [] };
  for (const check of checks) {
    if (!check.columns.some((c) => c.toLowerCase() === column.toLowerCase())) continue;
    let tokens: Token[];
    try {
      tokens = tokenize(check.expression);
    } catch {
      hints.unsupported.push(check.expression);
      continue;
    }
    for (const part of splitAnd(stripParens(tokens))) {
      const refsOthers = check.columns.length > 1;
      if (!interpret(hints, part, column) && !refsOthers) hints.unsupported.push(part.map((t) => t.text).join(' '));
    }
  }
  return hints;
}

/** Simple `a < b` style CHECKs between two columns, repaired by swapping values. */
export function pairwiseComparisons(checks: readonly CheckConstraint[]): PairwiseComparison[] {
  const out: PairwiseComparison[] = [];
  for (const check of checks) {
    if (check.columns.length !== 2) continue;
    let tokens: Token[];
    try {
      tokens = tokenize(check.expression);
    } catch {
      continue;
    }
    for (const part of splitAnd(stripParens(tokens))) {
      const p = stripParens(part);
      const [a, op, b] = p;
      if (p.length !== 3 || !a || !b || op?.type !== 'punct' || !['<', '<=', '>', '>='].includes(op.text)) continue;
      const left = check.columns.find((c) => isCol(a, c));
      const right = check.columns.find((c) => isCol(b, c));
      if (left && right && left !== right) out.push({ left, op: op.text as PairwiseComparison['op'], right });
    }
  }
  return out;
}
