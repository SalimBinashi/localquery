import type { Edge, Node } from '@xyflow/react';
import type { DatabaseMetadata, ForeignKeyMeta, TableMeta } from '@/types/database';

export interface TableNodeData extends Record<string, unknown> {
  readonly table: TableMeta;
  readonly fkColumns: ReadonlySet<string>;
  readonly uniqueColumns: ReadonlySet<string>;
}

export interface RelationshipEdgeData extends Record<string, unknown> {
  readonly fk: ForeignKeyMeta;
  readonly cardinality: '1:1' | 'N:1';
  readonly label: string;
}

const NODE_WIDTH = 250;
const ROW_H = 22;
const HEADER_H = 34;
const GAP_X = 110;
const GAP_Y = 36;

const lc = (s: string): string => s.toLowerCase();

/** One-to-one when the child's FK columns are exactly covered by a unique key of the child. */
function cardinality(fk: ForeignKeyMeta, child: TableMeta): '1:1' | 'N:1' {
  const cols = fk.mappings.map((m) => lc(m.from)).sort().join(',');
  return child.uniqueKeys.some((k) => k.map(lc).sort().join(',') === cols) ? '1:1' : 'N:1';
}

/** Deterministic layered layout: parents to the left of children, stacked by schema order. */
export function buildErd(md: DatabaseMetadata): { nodes: Node<TableNodeData>[]; edges: Edge<RelationshipEdgeData>[] } {
  const tables = md.tables.filter((t) => t.kind !== 'shadow');
  const byName = new Map(tables.map((t) => [lc(t.name), t]));
  const depth = new Map<string, number>(tables.map((t) => [lc(t.name), 0]));
  for (let pass = 0; pass < tables.length; pass++) {
    let changed = false;
    for (const t of tables) {
      for (const fk of t.foreignKeys) {
        const parent = lc(fk.toTable);
        if (parent === lc(t.name) || !byName.has(parent)) continue;
        const d = (depth.get(parent) ?? 0) + 1;
        if (d > (depth.get(lc(t.name)) ?? 0) && d < tables.length) {
          depth.set(lc(t.name), d);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const columnsY = new Map<number, number>();
  const nodes: Node<TableNodeData>[] = tables.map((t) => {
    const d = depth.get(lc(t.name)) ?? 0;
    const y = columnsY.get(d) ?? 0;
    columnsY.set(d, y + HEADER_H + t.columns.length * ROW_H + 10 + GAP_Y);
    return {
      id: t.name,
      type: 'table',
      position: { x: d * (NODE_WIDTH + GAP_X), y },
      data: {
        table: t,
        fkColumns: new Set(t.foreignKeys.flatMap((f) => f.mappings.map((m) => lc(m.from)))),
        uniqueColumns: new Set(t.uniqueKeys.filter((k) => k.length === 1).map((k) => lc(k[0] as string))),
      },
    };
  });
  const edges: Edge<RelationshipEdgeData>[] = tables.flatMap((t) =>
    t.foreignKeys
      .filter((fk) => byName.has(lc(fk.toTable)))
      .map((fk) => {
        const first = fk.mappings[0];
        const parent = byName.get(lc(fk.toTable)) as TableMeta;
        const composite = fk.mappings.length > 1;
        const card = cardinality(fk, t);
        const label = composite ? `(${fk.mappings.map((m) => m.from).join(', ')}) → (${fk.mappings.map((m) => m.to).join(', ')}) · ${card}` : `${first?.from} → ${first?.to} · ${card}`;
        return {
          id: `${t.name}-fk-${fk.id}`,
          source: t.name,
          target: parent.name,
          sourceHandle: `${first?.from ?? ''}-s`,
          targetHandle: `${first?.to ?? ''}-t`,
          type: 'relationship',
          data: { fk, cardinality: card, label },
        };
      }),
  );
  return { nodes, edges };
}
