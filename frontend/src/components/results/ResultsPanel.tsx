import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Terminal } from 'lucide-react';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/results/ErrorDisplay';
import { ResultsTable } from '@/components/results/ResultsTable';
import { ResultsToolbar } from '@/components/results/ResultsToolbar';
import { ResultsPagination } from '@/components/results/ResultsPagination';
import { useWorkspace } from '@/hooks/useWorkspace';
import { formatMs } from '@/lib/performance/performanceMetrics';
import { DISPLAY_LIMITS } from '@/lib/limits';
import type { StatementResult } from '@/types/query';

function defaultStatement(statements: readonly StatementResult[]): number {
  for (let i = statements.length - 1; i >= 0; i--) if (statements[i]?.returnsRows) return i;
  return Math.max(0, statements.length - 1);
}

function NonRowResult({ s }: { readonly s: StatementResult }) {
  return (
    <div className="flex items-start gap-2 p-4 text-xs" data-testid="statement-success">
      <CheckCircle2 size={14} className="mt-0.5 text-ok-hover" />
      <div>
        <p className="font-mono text-fg">
          {s.statementType} executed successfully
          {s.changes !== null && <span data-testid="statement-changes"> · {s.changes} row(s) changed</span>} · {formatMs(s.executionMs)}
        </p>
        <pre className="mt-1 max-w-full whitespace-pre-wrap break-words font-mono text-[11px] text-fg-3">{s.sql.slice(0, 400)}</pre>
      </div>
    </div>
  );
}

export function ResultsPanel() {
  const { state } = useWorkspace();
  const run = state.queryRun;
  const [selected, setSelected] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DISPLAY_LIMITS.pageSizes[0]);
  useEffect(() => {
    setSelected(run ? defaultStatement(run.result.statements) : 0);
    setPage(0);
  }, [run]);
  const stmt = run?.result.statements[selected];
  const pageRows = useMemo(() => stmt?.rows.slice(page * pageSize, (page + 1) * pageSize) ?? [], [stmt, page, pageSize]);

  if (state.busy === 'query') return <div className="p-4"><LoadingIndicator label="Executing query…" testId="results-loading" /></div>;
  if (state.queryError) return <div className="p-3"><ErrorDisplay error={state.queryError} testId="query-error" /></div>;
  if (!run) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-fg-3" data-testid="results-empty">
        <Terminal size={20} />
        <p>{state.resultsCleared ?? 'Run a query to see results from the live SQLite database.'}</p>
      </div>
    );
  }
  const r = run.result;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="results-panel">
      {r.statements.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-1 scroll-thin" role="group" aria-label="Statement results">
          {r.statements.map((s, i) => (
            <button key={s.index} type="button" aria-pressed={i === selected} onClick={() => { setSelected(i); setPage(0); }} data-testid={`statement-result-${i}`} className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] ${i === selected ? 'bg-info/15 text-info' : 'text-fg-3 hover:bg-subtle'}`}>
              #{i + 1} {s.statementType}
              {s.returnsRows ? ` · ${s.rowCount}` : s.changes !== null ? ` · Δ${s.changes}` : ''}
            </button>
          ))}
          {r.error && <span className="shrink-0 rounded px-2 py-0.5 font-mono text-[10px] text-danger">#{r.statements.length + 1} failed</span>}
        </div>
      )}
      {r.error && (
        <div className="shrink-0 p-2">
          <ErrorDisplay
            error={r.error}
            testId="query-error"
            footer={<p className="mt-2 text-fg-2">{r.statements.length > 0 ? `${r.statements.length} earlier statement(s) executed and remain applied (unless inside a transaction you roll back).` : 'No statements were executed.'}{r.skippedStatements > 0 ? ` ${r.skippedStatements} later statement(s) were skipped.` : ''}</p>}
          />
        </div>
      )}
      {stmt && stmt.returnsRows && (
        <>
          <ResultsToolbar statement={stmt} pageRows={pageRows} />
          <ResultsTable statement={stmt} rows={pageRows} offset={page * pageSize} />
          <ResultsPagination total={stmt.retainedRowCount} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
        </>
      )}
      {stmt && !stmt.returnsRows && <NonRowResult s={stmt} />}
    </div>
  );
}
