import { isPunct, tokenize, type Token } from '@/lib/schema/sqlTokenizer';

const MAIN_VERBS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'VALUES'];
const DML = new Set(['INSERT', 'UPDATE', 'DELETE', 'REPLACE']);

function safeTokens(sql: string): Token[] {
  try {
    return tokenize(sql);
  } catch {
    return [];
  }
}

/**
 * Labels a statement for display ("SELECT", "WITH…INSERT", "CREATE TABLE"...).
 * It is never used to decide whether rows are returned — that comes from SQLite itself.
 */
export function classifyStatement(sql: string): string {
  const tokens = safeTokens(sql);
  const first = tokens[0];
  if (!first || first.type !== 'word') return 'OTHER';
  if (first.value === 'WITH') {
    let depth = 0;
    for (const t of tokens.slice(1)) {
      if (isPunct(t, '(')) depth++;
      else if (isPunct(t, ')')) depth--;
      else if (depth === 0 && t.type === 'word' && MAIN_VERBS.includes(t.value)) return `WITH…${t.value}`;
    }
    return 'WITH';
  }
  if (first.value === 'CREATE' || first.value === 'DROP' || first.value === 'ALTER') {
    const words = tokens
      .slice(1, 4)
      .filter((t) => t.type === 'word' && ['TABLE', 'INDEX', 'VIEW', 'TRIGGER', 'VIRTUAL', 'UNIQUE', 'TEMP', 'TEMPORARY'].includes(t.value))
      .map((t) => t.value);
    const objectWord = words.find((w) => ['TABLE', 'INDEX', 'VIEW', 'TRIGGER'].includes(w));
    return objectWord ? `${first.value} ${words.includes('VIRTUAL') ? 'VIRTUAL ' : ''}${objectWord}` : first.value;
  }
  return first.value;
}

export function isDmlStatement(statementType: string): boolean {
  const verb = statementType.startsWith('WITH…') ? statementType.slice(5) : statementType;
  return DML.has(verb);
}
