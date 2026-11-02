export interface ParsedReference {
  readonly table: string;
  readonly columns: readonly string[];
  readonly onDelete: string | null;
  readonly onUpdate: string | null;
  readonly deferrable: boolean;
}

export interface ParsedColumn {
  readonly name: string;
  readonly type: string;
  readonly notNull: boolean;
  readonly primaryKey: boolean;
  readonly autoIncrement: boolean;
  readonly unique: boolean;
  readonly defaultExpression: string | null;
  readonly checks: readonly string[];
  readonly references: ParsedReference | null;
  readonly generated: { readonly expression: string; readonly stored: boolean } | null;
  readonly collate: string | null;
}

export type ParsedTableConstraint =
  | { readonly kind: 'primary-key'; readonly name: string | null; readonly columns: readonly string[] }
  | { readonly kind: 'unique'; readonly name: string | null; readonly columns: readonly string[] }
  | { readonly kind: 'check'; readonly name: string | null; readonly expression: string }
  | {
      readonly kind: 'foreign-key';
      readonly name: string | null;
      readonly columns: readonly string[];
      readonly references: ParsedReference;
    };

export interface ParsedCreateTable {
  readonly schema: string | null;
  readonly name: string;
  readonly temporary: boolean;
  readonly ifNotExists: boolean;
  readonly asSelect: boolean;
  readonly withoutRowid: boolean;
  readonly strict: boolean;
  readonly columns: readonly ParsedColumn[];
  readonly constraints: readonly ParsedTableConstraint[];
  readonly warnings: readonly string[];
}

export type StatementKind =
  | 'create-table'
  | 'create-virtual-table'
  | 'create-index'
  | 'create-view'
  | 'create-trigger'
  | 'alter'
  | 'drop'
  | 'dml'
  | 'select'
  | 'pragma'
  | 'transaction'
  | 'other';
