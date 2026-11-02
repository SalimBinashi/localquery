import { isPunct, isWord, lineColumnAt, tokenize, type Token } from '@/lib/schema/sqlTokenizer';

export interface SqlStatementSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly line: number;
}

function isTriggerStart(tokens: readonly Token[], first: number): boolean {
  let i = first;
  if (!isWord(tokens[i], 'CREATE')) return false;
  i++;
  if (isWord(tokens[i], 'TEMP', 'TEMPORARY')) i++;
  return isWord(tokens[i], 'TRIGGER');
}

/**
 * Splits SQL into statements using the lexer, so semicolons inside strings, quoted identifiers,
 * comments and CREATE TRIGGER ... BEGIN ... END bodies never split a statement.
 */
export function splitStatements(sql: string): SqlStatementSpan[] {
  const tokens = tokenize(sql);
  const spans: SqlStatementSpan[] = [];
  let first = 0;
  let inTrigger = false;
  let depth = 0;
  const flush = (lastIndex: number): void => {
    const startTok = tokens[first];
    const endTok = tokens[lastIndex];
    if (startTok && endTok && first <= lastIndex) {
      const onlySemicolon = first === lastIndex && isPunct(startTok, ';');
      if (!onlySemicolon) {
        spans.push({
          text: sql.slice(startTok.start, endTok.end),
          start: startTok.start,
          end: endTok.end,
          line: lineColumnAt(sql, startTok.start).line,
        });
      }
    }
    first = lastIndex + 1;
    inTrigger = false;
    depth = 0;
  };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (i === first) inTrigger = isTriggerStart(tokens, i);
    if (inTrigger && isWord(tok, 'BEGIN', 'CASE')) depth++;
    else if (inTrigger && isWord(tok, 'END') && depth > 0) depth--;
    else if (isPunct(tok, ';') && depth === 0) flush(i);
  }
  if (first < tokens.length) flush(tokens.length - 1);
  return spans;
}
