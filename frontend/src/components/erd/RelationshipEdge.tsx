import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { RelationshipEdgeData } from '@/components/erd/erdLayout';

export function RelationshipEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected }: EdgeProps<Edge<RelationshipEdgeData>>) {
  const self = data?.fk.fromTable.toLowerCase() === data?.fk.toTable.toLowerCase();
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10, offset: self ? 40 : 20 });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: selected ? 'var(--accent-purple)' : 'var(--accent-blue)', strokeWidth: selected ? 2 : 1.25, strokeDasharray: data?.cardinality === '1:1' ? '4 3' : undefined }} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[9.5px] text-fg-2 shadow"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          data-testid={`erd-edge-label-${id}`}
          title={`${data?.fk.fromTable} → ${data?.fk.toTable} · ON DELETE ${data?.fk.onDelete} · ON UPDATE ${data?.fk.onUpdate}`}
        >
          {data?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
