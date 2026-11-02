import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { KeyRound, Link } from 'lucide-react';
import type { TableNodeData } from '@/components/erd/erdLayout';

function TableNodeView({ data }: NodeProps<Node<TableNodeData>>) {
  const { table, fkColumns, uniqueColumns } = data;
  return (
    <div className="w-[250px] overflow-hidden rounded-md border border-line bg-panel font-mono text-[11px] shadow-lg" data-testid={`erd-node-${table.name}`}>
      <div className="flex items-center justify-between border-b border-line bg-panel-header px-2.5 py-2">
        <span className="font-semibold text-fg">{table.name}</span>
        <span className="text-[10px] text-fg-3">
          {table.kind !== 'table' ? `${table.kind} · ` : ''}
          {table.rowCount ?? '?'} rows
        </span>
      </div>
      {table.columns.map((c) => {
        const isFk = fkColumns.has(c.name.toLowerCase());
        return (
          <div key={c.name} className="relative flex h-[22px] items-center gap-1.5 px-2.5" data-testid={`erd-column-${table.name}-${c.name}`}>
            <Handle type="target" position={Position.Left} id={`${c.name}-t`} className="!h-1.5 !w-1.5 !border-0 !bg-fg-3" />
            <span className="flex w-7 shrink-0 gap-0.5">
              {c.primaryKeyPosition > 0 && <KeyRound size={11} className="text-warn" aria-label="primary key" />}
              {isFk && <Link size={11} className="text-info" aria-label="foreign key" />}
            </span>
            <span className={`truncate ${c.primaryKeyPosition > 0 ? 'font-semibold text-fg' : 'text-fg-2'}`}>{c.name}</span>
            <span className="ml-auto shrink-0 text-[10px] uppercase text-fg-3">
              {c.declaredType || 'any'}
              {c.notNull || c.primaryKeyPosition > 0 ? '' : '?'}
              {uniqueColumns.has(c.name.toLowerCase()) && c.primaryKeyPosition === 0 ? ' · UQ' : ''}
            </span>
            <Handle type="source" position={Position.Right} id={`${c.name}-s`} className="!h-1.5 !w-1.5 !border-0 !bg-fg-3" />
          </div>
        );
      })}
    </div>
  );
}

export const TableNode = memo(TableNodeView);
