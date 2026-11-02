import { useState } from 'react';
import { ClipboardCopy, Download } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { copyText } from '@/lib/utils/clipboard';
import { downloadBlob, timestampedName } from '@/lib/utils/download';
import { toCsv, toTsv } from '@/lib/query/resultFormatter';
import { formatMs } from '@/lib/performance/performanceMetrics';
import type { SQLiteValue } from '@/types/database';
import type { StatementResult } from '@/types/query';

export function ResultsToolbar({ statement, pageRows }: { readonly statement: StatementResult; readonly pageRows: readonly (readonly SQLiteValue[])[] }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const cols = statement.columns.map((c) => c.name);
  const copy = async (rows: readonly (readonly SQLiteValue[])[], what: string): Promise<void> => {
    const r = await copyText(toTsv(cols, rows));
    setFeedback(r.ok ? `Copied ${what} (${rows.length} rows)` : `Copy failed: ${r.reason}`);
    setTimeout(() => setFeedback(null), 3000);
  };
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5" data-testid="results-toolbar">
      <span className="font-mono text-[11px] text-fg-2" data-testid="results-row-count">
        {statement.rowCount.toLocaleString()} row{statement.rowCount === 1 ? '' : 's'} · {statement.columns.length} col · SQLite {formatMs(statement.executionMs)}
      </span>
      {statement.truncated && (
        <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] text-warn" data-testid="results-truncated" title="The query ran to completion; only the display/transfer was limited.">
          showing first {statement.retainedRowCount.toLocaleString()} of {statement.rowCount.toLocaleString()} — display limit, query fully executed
        </span>
      )}
      <span className="ml-auto text-[11px] text-fg-3" aria-live="polite" data-testid="results-copy-feedback">
        {feedback}
      </span>
      <Button variant="ghost" icon={<ClipboardCopy size={12} />} onClick={() => void copy(pageRows, 'page')} data-testid="copy-page-button">
        Copy page
      </Button>
      <Button variant="ghost" icon={<ClipboardCopy size={12} />} onClick={() => void copy(statement.rows, 'all retained rows')} data-testid="copy-results-button">
        Copy all
      </Button>
      <Button variant="ghost" icon={<Download size={12} />} onClick={() => downloadBlob(toCsv(cols, statement.rows), timestampedName('query-result', 'csv'), 'text/csv;charset=utf-8')} data-testid="export-csv-button" title={statement.truncated ? 'Exports the retained rows only' : 'Exports all rows'}>
        CSV
      </Button>
    </div>
  );
}
