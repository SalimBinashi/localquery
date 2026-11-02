import { Network } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import { ERDCanvas } from '@/components/erd/ERDCanvas';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/results/ErrorDisplay';
import { useWorkspace } from '@/hooks/useWorkspace';

export default function ERDPanel() {
  const { state } = useWorkspace();
  const md = state.metadata;
  if (state.engineError) return <div className="p-3"><ErrorDisplay error={state.engineError} testId="erd-error" /></div>;
  if (!md) {
    return state.busy || state.engineStatus === 'initializing' ? (
      <div className="p-4"><LoadingIndicator label="Building schema metadata…" testId="erd-loading" /></div>
    ) : (
      <p className="p-4 text-xs text-fg-3" data-testid="erd-empty">Apply a schema to see its entity-relationship diagram.</p>
    );
  }
  if (md.tables.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-fg-3" data-testid="erd-empty">
        <Network size={20} />
        The database has no tables.
      </div>
    );
  }
  return (
    <div className="relative h-full" data-testid="erd-panel" data-relationships={md.relationships.length}>
      <ReactFlowProvider>
        <ERDCanvas metadata={md} />
      </ReactFlowProvider>
    </div>
  );
}
