import { useEffect, useMemo } from 'react';
import { Background, Controls, MarkerType, Panel, ReactFlow, useEdgesState, useNodesState, type Edge, type Node } from '@xyflow/react';
import { KeyRound, Link } from 'lucide-react';
import { TableNode } from '@/components/erd/TableNode';
import { RelationshipEdge } from '@/components/erd/RelationshipEdge';
import { buildErd, type RelationshipEdgeData, type TableNodeData } from '@/components/erd/erdLayout';
import type { DatabaseMetadata } from '@/types/database';

const nodeTypes = { table: TableNode };
const edgeTypes = { relationship: RelationshipEdge };

function Legend() {
  return (
    <Panel position="bottom-right" className="rounded-md border border-line bg-panel px-2.5 py-2 font-mono text-[10px] text-fg-2 shadow" data-testid="erd-legend">
      <div className="flex items-center gap-1.5"><KeyRound size={10} className="text-warn" /> primary key</div>
      <div className="flex items-center gap-1.5"><Link size={10} className="text-info" /> foreign key column</div>
      <div>? nullable · UQ unique</div>
      <div className="mt-1 flex items-center gap-1.5"><span className="inline-block h-px w-5 bg-info" /> child → parent (N:1)</div>
      <div className="flex items-center gap-1.5"><span className="inline-block w-5 border-t border-dashed border-info" /> one-to-one</div>
      <div className="mt-1 text-fg-3">From PRAGMA foreign_key_list only</div>
    </Panel>
  );
}

/** Rebuilt only when the metadata object changes (i.e. after a schema change), not after every query. */
export function ERDCanvas({ metadata }: { readonly metadata: DatabaseMetadata }) {
  const graph = useMemo(() => buildErd(metadata), [metadata]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TableNodeData>>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<RelationshipEdgeData>>(graph.edges);
  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges.map((e) => ({ ...e, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent-blue)' } })));
  }, [graph, setNodes, setEdges]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
      data-testid="erd-canvas"
    >
      <Background gap={20} size={1} color="var(--border-color)" />
      <Controls showInteractive={false} />
      <Legend />
    </ReactFlow>
  );
}
