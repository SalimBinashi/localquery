import { SqlEditor } from '@/components/query/SqlEditor';
import { SeedConfiguration } from '@/components/schema/SeedConfiguration';
import { SchemaActions } from '@/components/schema/SchemaActions';
import { SchemaSummary } from '@/components/schema/SchemaSummary';
import { ErrorDisplay } from '@/components/results/ErrorDisplay';
import { useWorkspace } from '@/hooks/useWorkspace';

export function SchemaEditor() {
  const { state, dispatch, actions } = useWorkspace();
  return (
    <section aria-label="Schema and seed editor" className="flex h-full min-h-0 flex-col bg-panel" data-testid="schema-pane">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-panel-header px-3">
        <h2 className="panel-title">Schema · DDL</h2>
        <span className="font-mono text-[10px] text-fg-3">{state.applied && state.applied.text !== state.schemaText ? 'edited — not applied' : state.applied ? 'applied' : 'not applied'}</span>
      </div>
      <div className="min-h-[140px] flex-[3_1_0%] overflow-hidden border-b border-line">
        <SqlEditor value={state.schemaText} onChange={(text) => dispatch({ type: 'EDIT_SCHEMA', text })} onRun={() => void actions.applySchema()} ariaLabel="Schema SQL editor" testId="ddl-editor" />
      </div>
      <div className="flex min-h-0 flex-[2_1_0%] flex-col overflow-auto scroll-thin">
        <SeedConfiguration />
        <SchemaActions />
        {state.schemaError && (
          <div className="px-3 pb-3">
            <ErrorDisplay error={state.schemaError} testId="schema-error" footer={<p className="mt-2 text-fg-2">The previous database (if any) is unchanged.</p>} />
          </div>
        )}
        <SchemaSummary />
      </div>
    </section>
  );
}
