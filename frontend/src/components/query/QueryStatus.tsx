import { useWorkspace } from '@/hooks/useWorkspace';
import { formatMs } from '@/lib/performance/performanceMetrics';

export function QueryStatus() {
  const { state } = useWorkspace();
  const run = state.queryRun;
  let text: string;
  let tone = 'text-fg-3';
  if (state.engineStatus !== 'ready') text = state.engineStatus === 'initializing' ? 'Waiting for SQLite to initialize…' : 'Database unavailable.';
  else if (state.busy === 'query') text = 'Executing in the SQLite worker…';
  else if (state.busy) text = `Busy (${state.busy})…`;
  else if (state.queryError) {
    text = `Request failed: ${state.queryError.message}`;
    tone = 'text-danger';
  } else if (run) {
    const r = run.result;
    const ok = r.statements.length;
    text = r.error
      ? `${ok} statement(s) succeeded, statement ${ok + 1} failed${r.skippedStatements ? `, ${r.skippedStatements} skipped` : ''} · SQLite ${formatMs(r.totalExecutionMs)}`
      : `${ok} statement(s) OK · SQLite ${formatMs(r.totalExecutionMs)} · round-trip ${formatMs(run.roundTripMs)}`;
    tone = r.error ? 'text-danger' : 'text-ok-hover';
    if (r.inTransaction) text += ' · transaction open (COMMIT or ROLLBACK)';
  } else text = 'Ready. Statements run directly against the in-memory database; mutations are not part of share links.';
  return (
    <div role="status" aria-live="polite" data-testid="query-status" className={`flex h-7 shrink-0 items-center truncate border-t border-line bg-panel-header px-3 font-mono text-[11px] ${tone}`}>
      {text}
    </div>
  );
}
