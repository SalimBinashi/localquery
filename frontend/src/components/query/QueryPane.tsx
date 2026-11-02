import { useMemo, useState } from 'react';
import { SqlEditor } from '@/components/query/SqlEditor';
import { QueryToolbar } from '@/components/query/QueryToolbar';
import { QueryHistory } from '@/components/query/QueryHistory';
import { QueryStatus } from '@/components/query/QueryStatus';
import { useWorkspace } from '@/hooks/useWorkspace';

export function QueryPane({ onRan }: { readonly onRan?: () => void }) {
  const { state, dispatch, actions } = useWorkspace();
  const [historyOpen, setHistoryOpen] = useState(false);
  const completion = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const t of state.metadata?.tables ?? []) out[t.name] = t.columns.map((c) => c.name);
    for (const v of state.metadata?.views ?? []) out[v.name] = [...v.columns];
    return out;
  }, [state.metadata]);
  const run = async (): Promise<void> => {
    await actions.runQuery();
    onRan?.();
  };
  return (
    <section aria-label="SQL query console" className="relative flex h-full min-h-0 flex-col bg-panel" data-testid="query-pane">
      <QueryToolbar onRun={() => void run()} historyOpen={historyOpen} onToggleHistory={() => setHistoryOpen((o) => !o)} />
      <div className="relative min-h-0 flex-1">
        <SqlEditor value={state.queryText} onChange={(text) => dispatch({ type: 'EDIT_QUERY', text })} onRun={() => void run()} ariaLabel="SQL query editor" testId="query-editor" completionSchema={completion} />
        {historyOpen && <QueryHistory onClose={() => setHistoryOpen(false)} />}
      </div>
      <QueryStatus />
    </section>
  );
}
