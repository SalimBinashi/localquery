import { lazy, Suspense } from 'react';
import { Tabs } from '@/components/common/Tabs';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ResultsPanel } from '@/components/results/ResultsPanel';
import { ResultsMetadata } from '@/components/results/ResultsMetadata';
import { useWorkspace } from '@/hooks/useWorkspace';
import type { InspectorTab } from '@/app/providers/workspaceReducer';

const ERDPanel = lazy(() => import('@/components/erd/ERDPanel'));

export function InspectorPane() {
  const { state, dispatch } = useWorkspace();
  const tab = state.inspectorTab;
  return (
    <section aria-label="Results and inspection" className="flex h-full min-h-0 flex-col bg-panel" data-testid="inspector-pane">
      <div className="shrink-0 border-b border-line bg-panel-header px-1">
        <Tabs<InspectorTab>
          label="Inspector"
          idPrefix="inspector"
          value={tab}
          onChange={(t) => dispatch({ type: 'SET_TAB', tab: t })}
          items={[
            { id: 'results', label: 'Results', testId: 'results-tab-button' },
            { id: 'erd', label: `Schema / ERD${state.metadata ? ` · ${state.metadata.tables.length}` : ''}`, testId: 'erd-tab-button' },
            { id: 'details', label: 'Execution', testId: 'execution-tab-button' },
          ]}
        />
      </div>
      <div id={`inspector-panel-${tab}`} role="tabpanel" aria-labelledby={`inspector-tab-${tab}`} className="min-h-0 flex-1">
        {tab === 'results' && <ResultsPanel />}
        {tab === 'erd' && (
          <Suspense fallback={<div className="p-4"><LoadingIndicator label="Loading diagram…" /></div>}>
            <ERDPanel />
          </Suspense>
        )}
        {tab === 'details' && <ResultsMetadata />}
      </div>
    </section>
  );
}
