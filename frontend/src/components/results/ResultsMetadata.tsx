import { useWorkspace } from '@/hooks/useWorkspace';
import { formatMs, transferOverhead } from '@/lib/performance/performanceMetrics';
import { ErrorDisplay } from '@/components/results/ErrorDisplay';

function Metric({ label, value, hint, testId }: { readonly label: string; readonly value: string; readonly hint?: string; readonly testId?: string }) {
  return (
    <div className="rounded-md border border-line bg-app px-3 py-2" title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-fg-3">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-fg" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

/** Execution details: every number shown here was measured, and each is labelled with what it covers. */
export function ResultsMetadata() {
  const { state } = useWorkspace();
  const run = state.queryRun;
  const t = state.applied?.result.timings;
  return (
    <div className="h-full space-y-4 overflow-auto p-3 scroll-thin" data-testid="execution-details">
      <div>
        <h3 className="panel-title mb-2">Engine & schema</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="WASM init" value={formatMs(state.initMs)} hint="Loading + instantiating sql.js inside the worker" testId="metric-init" />
          <Metric label="Schema DDL" value={formatMs(t?.schemaMs)} hint="Executing schema statements in the worker (staging DB)" testId="metric-schema" />
          <Metric label="Mock generation" value={formatMs(t?.seedMs)} hint="Generating + inserting seed rows, including FK validation" testId="metric-seed" />
          <Metric label="Rows inserted" value={state.seedReport ? state.seedReport.totalInserted.toLocaleString() : '—'} testId="metric-rows-inserted" />
          <Metric label="Metadata inspect" value={formatMs(t?.inspectMs)} hint="PRAGMA-based introspection" />
          <Metric label="Apply total (worker)" value={formatMs(t?.totalMs)} />
          <Metric label="Apply round-trip" value={formatMs(state.applied?.roundTripMs)} hint="Main thread: request sent → response received" />
          <Metric label="SQLite" value={state.sqliteVersion ?? '—'} />
        </div>
      </div>
      <div>
        <h3 className="panel-title mb-2">Last query</h3>
        {!run && <p className="text-xs text-fg-3">No query executed yet.</p>}
        {run && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Metric label="SQLite execution" value={formatMs(run.result.totalExecutionMs)} hint="Measured in the worker around statement stepping" testId="metric-query-exec" />
              <Metric label="Round-trip" value={formatMs(run.roundTripMs)} hint="Main thread, includes worker messaging and structured-clone transfer" testId="metric-query-roundtrip" />
              <Metric label="Messaging + transfer" value={formatMs(transferOverhead(run.roundTripMs, run.result.totalExecutionMs))} hint="Round-trip minus SQLite execution (includes metadata refresh after DDL)" />
              <Metric label="Statements" value={`${run.result.statements.length}${run.result.error ? ' + 1 failed' : ''}`} />
            </div>
            <table className="mt-3 w-full font-mono text-[11px]" data-testid="statement-metrics">
              <thead className="text-fg-3">
                <tr className="text-left">
                  <th className="py-1 font-normal">#</th>
                  <th className="font-normal">type</th>
                  <th className="font-normal">line</th>
                  <th className="text-right font-normal">rows produced</th>
                  <th className="text-right font-normal">rows displayed</th>
                  <th className="text-right font-normal">changes</th>
                  <th className="text-right font-normal">sqlite ms</th>
                </tr>
              </thead>
              <tbody>
                {run.result.statements.map((s) => (
                  <tr key={s.index} className="border-t border-line text-fg-2">
                    <td className="py-1">{s.index + 1}</td>
                    <td className="text-fg">{s.statementType}</td>
                    <td>{s.line}</td>
                    <td className="text-right">{s.returnsRows ? s.rowCount : '—'}</td>
                    <td className="text-right">{s.returnsRows ? `${s.retainedRowCount}${s.truncated ? ' (truncated)' : ''}` : '—'}</td>
                    <td className="text-right">{s.changes ?? '—'}</td>
                    <td className="text-right">{s.executionMs.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-fg-3">
              Schema changed: {run.result.schemaChanged ? 'yes (metadata & ERD refreshed)' : 'no'} · Data changed: {run.result.dataChanged ? 'yes' : 'no'} · Open transaction: {run.result.inTransaction ? 'yes' : 'no'}. Result column types are observed storage classes; sql.js does not expose declared types for result columns.
            </p>
            {run.result.error && <div className="mt-3"><ErrorDisplay error={run.result.error} testId="details-error" /></div>}
          </>
        )}
      </div>
    </div>
  );
}
