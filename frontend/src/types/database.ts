/**
 * 64-bit integer policy: integers within Number.MAX_SAFE_INTEGER are plain numbers;
 * anything outside that range is carried as exact decimal text so it is never rounded.
 */
export interface SQLiteBigInt {
  readonly kind: 'int64';
  readonly text: string;
}

/** BLOBs are always Uint8Array; they are never coerced to strings. */
export type SQLiteValue = null | string | number | SQLiteBigInt | Uint8Array;

/** Values that may be bound to a prepared statement parameter. */
export type BindableValue = null | string | number | Uint8Array;

export type StorageClass = 'null' | 'integer' | 'real' | 'text' | 'blob';

export type TypeAffinity = 'INTEGER' | 'TEXT' | 'BLOB' | 'REAL' | 'NUMERIC';

export type ColumnVisibility = 'normal' | 'hidden' | 'generated-virtual' | 'generated-stored';

export interface CheckConstraint {
  readonly expression: string;
  readonly scope: 'column' | 'table';
  /** Columns of the owning table referenced by the expression. */
  readonly columns: readonly string[];
}

export interface ColumnMeta {
  readonly cid: number;
  readonly name: string;
  readonly declaredType: string;
  readonly affinity: TypeAffinity;
  readonly notNull: boolean;
  readonly defaultValue: string | null;
  /** 1-based position within the primary key, 0 when not part of it. */
  readonly primaryKeyPosition: number;
  readonly visibility: ColumnVisibility;
  readonly isRowidAlias: boolean;
  readonly autoIncrement: boolean;
}

export interface ColumnMapping {
  readonly from: string;
  readonly to: string;
}

export interface ForeignKeyMeta {
  readonly id: number;
  readonly fromTable: string;
  readonly toTable: string;
  /** Ordered mappings; composite keys are kept as one relationship. */
  readonly mappings: readonly ColumnMapping[];
  readonly onUpdate: string;
  readonly onDelete: string;
  readonly match: string;
  /** True when the parent columns were implied (REFERENCES t without a column list). */
  readonly impliedParentColumns: boolean;
  readonly parentExists: boolean;
}

export interface IndexMeta {
  readonly name: string;
  readonly unique: boolean;
  readonly origin: 'c' | 'u' | 'pk';
  readonly partial: boolean;
  /** null entries are expression-index terms. */
  readonly columns: readonly (string | null)[];
}

export type TableKind = 'table' | 'virtual' | 'shadow';

export interface TableMeta {
  readonly name: string;
  readonly kind: TableKind;
  readonly withoutRowid: boolean;
  readonly strict: boolean;
  readonly sql: string | null;
  readonly columns: readonly ColumnMeta[];
  readonly primaryKey: readonly string[];
  /** Column sets that must be unique (PK + UNIQUE constraints + full unique indexes). */
  readonly uniqueKeys: readonly (readonly string[])[];
  readonly checks: readonly CheckConstraint[];
  readonly foreignKeys: readonly ForeignKeyMeta[];
  readonly indexes: readonly IndexMeta[];
  readonly rowCount: number | null;
  readonly seedable: boolean;
  readonly skipReason: string | null;
  readonly parseWarnings: readonly string[];
}

export interface ViewMeta {
  readonly name: string;
  readonly sql: string | null;
  readonly columns: readonly string[];
}

export interface TriggerMeta {
  readonly name: string;
  readonly table: string;
  readonly sql: string | null;
}

export interface DatabaseMetadata {
  readonly sqliteVersion: string;
  readonly tables: readonly TableMeta[];
  readonly views: readonly ViewMeta[];
  readonly triggers: readonly TriggerMeta[];
  readonly relationships: readonly ForeignKeyMeta[];
  readonly schemaVersion: number;
  readonly foreignKeysEnabled: boolean;
  readonly inspectionMs: number;
}
