import { useState } from 'react';
import { Eraser, Play } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { useWorkspace } from '@/hooks/useWorkspace';

export function SchemaActions() {
  const { state, dispatch, actions } = useWorkspace();
  const [confirm, setConfirm] = useState(false);
  const ready = state.engineStatus === 'ready';
  const applying = state.busy === 'schema';
  const apply = (): void => {
    if (state.dbDirty) setConfirm(true);
    else void actions.applySchema();
  };
  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="md" icon={<Play size={13} />} onClick={apply} disabled={!ready || state.busy !== null} data-testid="generate-seed-button" title="Rebuild the database from this schema (Ctrl/Cmd+Enter in the schema editor)">
          {state.seedOnApply ? 'Interpret Schema & Generate Seed' : 'Apply Schema'}
        </Button>
        <Button variant="ghost" icon={<Eraser size={13} />} onClick={() => dispatch({ type: 'EDIT_SCHEMA', text: '' })} disabled={applying} data-testid="clear-schema-button" title="Clears the editor only; the database is untouched until you apply">
          Clear editor
        </Button>
        {applying && <LoadingIndicator label={state.progress ?? 'Applying schema…'} testId="schema-progress" />}
        {!ready && state.engineStatus === 'initializing' && <LoadingIndicator label="Loading SQLite WebAssembly…" testId="engine-loading" />}
      </div>
      <p className="text-[11px] leading-snug text-fg-3">Applying builds a fresh in-memory database in a staging copy and swaps it in only if every statement and the seed succeed. It replaces the current database, including unexported query changes.</p>
      <ConfirmDialog
        open={confirm}
        title="Rebuild the database?"
        confirmLabel="Rebuild database"
        destructive
        testId="apply-confirm-dialog"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void actions.applySchema();
        }}
      >
        The live database contains changes made by queries or an import. Applying the schema discards them and rebuilds the database from the schema editor. Export the database first if you need them.
      </ConfirmDialog>
    </div>
  );
}
