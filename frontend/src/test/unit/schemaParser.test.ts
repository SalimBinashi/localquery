import { describe, expect, it } from 'vitest';
import { classifyStatementKind, parseCreateTable, referencedColumns } from '@/lib/schema/schemaParser';
import { splitStatements } from '@/lib/query/sqlStatementSplitter';
import { tokenize, SqlLexError } from '@/lib/schema/sqlTokenizer';
import { normalizeIdentifier, quoteIdentifier, sqlLiteral } from '@/lib/schema/identifierUtils';
import { classifyStatement, isDmlStatement } from '@/lib/query/queryClassifier';
import { typeAffinity } from '@/lib/schema/schemaInspector';

describe('tokenizer', () => {
  it('keeps strings, quoted identifiers and comments intact', () => {
    const toks = tokenize(`SELECT 'a;b,(c)' AS "we""ird", [x y], \`b\` -- c;\n/* d; */ FROM t`);
    expect(toks.map((t) => t.type)).toEqual(['word', 'string', 'word', 'quoted', 'punct', 'quoted', 'punct', 'quoted', 'word', 'word']);
    expect(toks[1]?.value).toBe('a;b,(c)');
    expect(toks[3]?.value).toBe('we"ird');
    expect(toks[5]?.value).toBe('x y');
  });
  it('rejects unterminated strings', () => {
    expect(() => tokenize("SELECT 'oops")).toThrow(SqlLexError);
  });
});

describe('statement splitter', () => {
  it('ignores semicolons in strings, comments and trigger bodies', () => {
    const sql = `CREATE TABLE a(x TEXT DEFAULT ';');\n-- ; comment\nCREATE TRIGGER trg AFTER INSERT ON a BEGIN\n  UPDATE a SET x = 'y;' WHERE x = (CASE WHEN 1 THEN 'a' END);\n  DELETE FROM a WHERE 0;\nEND;\nSELECT 1`;
    const parts = splitStatements(sql);
    expect(parts).toHaveLength(3);
    expect(parts[1]?.text).toMatch(/^CREATE TRIGGER[\s\S]*END;$/);
    expect(parts[1]?.line).toBe(3);
    expect(parts[2]?.text).toBe('SELECT 1');
  });
});

describe('CREATE TABLE parser', () => {
  it('parses columns, inline and table constraints, composite keys and nested expressions', () => {
    const p = parseCreateTable(`CREATE TABLE IF NOT EXISTS main."Order Items" (
      "order id" INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      sku VARCHAR(32) NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0 AND qty <= (10 * 10)),
      note TEXT DEFAULT 'a, (b)',
      price DECIMAL(10, 2) DEFAULT (round(1.5 * 2, 2)),
      total REAL GENERATED ALWAYS AS (qty * price) STORED,
      CONSTRAINT pk PRIMARY KEY ("order id", sku),
      UNIQUE (sku, note),
      CHECK (price >= 0),
      FOREIGN KEY ("order id", sku) REFERENCES lines(order_id, sku) ON UPDATE SET NULL
    ) WITHOUT ROWID, STRICT`);
    expect(p.schema).toBe('main');
    expect(p.name).toBe('Order Items');
    expect(p.ifNotExists).toBe(true);
    expect(p.withoutRowid).toBe(true);
    expect(p.strict).toBe(true);
    expect(p.columns.map((c) => c.name)).toEqual(['order id', 'sku', 'qty', 'note', 'price', 'total']);
    expect(p.columns[0]?.references).toMatchObject({ table: 'orders', columns: ['id'], onDelete: 'CASCADE' });
    expect(p.columns[1]?.type).toBe('VARCHAR(32)');
    expect(p.columns[2]?.checks).toEqual(['qty > 0 AND qty <= (10 * 10)']);
    expect(p.columns[3]?.defaultExpression).toBe("'a, (b)'");
    expect(p.columns[4]?.type).toBe('DECIMAL(10, 2)');
    expect(p.columns[4]?.defaultExpression).toBe('(round(1.5 * 2, 2))');
    expect(p.columns[5]?.generated).toEqual({ expression: 'qty * price', stored: true });
    expect(p.constraints).toEqual([
      { kind: 'primary-key', name: 'pk', columns: ['order id', 'sku'] },
      { kind: 'unique', name: null, columns: ['sku', 'note'] },
      { kind: 'check', name: null, expression: 'price >= 0' },
      { kind: 'foreign-key', name: null, columns: ['order id', 'sku'], references: { table: 'lines', columns: ['order_id', 'sku'], onDelete: null, onUpdate: 'SET NULL', deferrable: false } },
    ]);
  });
  it('detects AUTOINCREMENT, CREATE TABLE AS and invalid DDL', () => {
    expect(parseCreateTable('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT)').columns[0]?.autoIncrement).toBe(true);
    expect(parseCreateTable('CREATE TABLE t AS SELECT 1 AS x').asSelect).toBe(true);
    expect(() => parseCreateTable('CREATE TABLE t (id INTEGER')).toThrow();
    expect(() => parseCreateTable('CREATE VIRTUAL TABLE t USING fts3(x)')).toThrow(/VIRTUAL/);
  });
  it('classifies statements and finds referenced columns', () => {
    expect(classifyStatementKind('create unique index i on t(x)')).toBe('create-index');
    expect(classifyStatementKind('CREATE VIRTUAL TABLE v USING fts3(a)')).toBe('create-virtual-table');
    expect(referencedColumns('length("Name") > 2 AND age >= 18', ['Name', 'age', 'other'])).toEqual(['Name', 'age']);
  });
});

describe('identifiers and literals', () => {
  it('quotes identifiers safely', () => {
    expect(quoteIdentifier('we"ird name')).toBe('"we""ird name"');
    expect(quoteIdentifier('select')).toBe('"select"');
    expect(normalizeIdentifier('createdAt')).toBe('created_at');
    expect(normalizeIdentifier('Email Address')).toBe('email_address');
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral(new Uint8Array([0, 255]))).toBe("X'00ff'");
  });
  it('applies SQLite type affinity rules', () => {
    expect(typeAffinity('BIGINT')).toBe('INTEGER');
    expect(typeAffinity('VARCHAR(20)')).toBe('TEXT');
    expect(typeAffinity('')).toBe('BLOB');
    expect(typeAffinity('DOUBLE PRECISION')).toBe('REAL');
    expect(typeAffinity('DECIMAL(10,2)')).toBe('NUMERIC');
    expect(typeAffinity('BOOLEAN')).toBe('NUMERIC');
  });
});

describe('query classifier', () => {
  it('labels statements without relying on SELECT prefixes', () => {
    expect(classifyStatement('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x')).toBe('WITH…INSERT');
    expect(classifyStatement('/* c */ delete from t')).toBe('DELETE');
    expect(classifyStatement('CREATE UNIQUE INDEX i ON t(x)')).toBe('CREATE INDEX');
    expect(isDmlStatement('WITH…UPDATE')).toBe(true);
    expect(isDmlStatement('SELECT')).toBe(false);
  });
});
