import { useState } from 'react';
import { Copy } from 'lucide-react';
import { cellKind, formatCell, toExportText, type CellKind } from '@/lib/query/resultFormatter';
import { copyText } from '@/lib/utils/clipboard';
import { DISPLAY_LIMITS } from '@/lib/limits';
import type { SQLiteValue } from '@/types/database';
import type { StatementResult } from '@/types/query';

const KIND_CLASS: Record<CellKind, string> = {
  null: 'rounded bg-null-bg px-1 text-[10px] font-bold text-null-fg',
  blob: 'rounded bg-blob-bg px-1 text-[10px] text-blob-fg',
  integer: 'text-info',
  real: 'text-info',
  int64: 'text-info',
  text: 'text-fg',
};

function CellInspector({ value, column, onClose }: { readonly value: SQLiteValue; readonly column: string; readonly onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const exact = toExportText(value);
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-line bg-panel-header px-3 py-1.5" data-testid="cell-inspector">
      <span className="shrink-0 font-mono text-[10px] text-fg-3">
        {column} · {cellKind(value)}
        {value instanceof Uint8Array ? ` · ${value.length} bytes` : ''}
      </span>
      <pre className="max-h-24 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-fg scroll-thin" data-testid="cell-inspector-value">
        {exact === null ? <span className={KIND_CLASS.null}>NULL</span> : exact}
      </pre>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-fg-2 hover:bg-subtle hover:text-fg"
        data-testid="copy-cell-button"
        onClick={async () => {
          const r = await copyText(exact ?? 'NULL');
          setMsg(r.ok ? 'Copied' : 'Copy failed');
        }}
      >
        <Copy size={11} /> {msg ?? 'Copy value'}
      </button>
      <button type="button" className="shrink-0 text-[11px] text-fg-3 hover:text-fg" onClick={onClose} data-testid="close-cell-inspector">
        ✕
      </button>
    </div>
  );
}

export function ResultsTable({ statement, rows, offset }: { readonly statement: StatementResult; readonly rows: readonly (readonly SQLiteValue[])[]; readonly offset: number }) {
  const [cell, setCell] = useState<{ r: number; c: number } | null>(null);
  const visible = statement.columns.slice(0, DISPLAY_LIMITS.maxVisibleColumns);
  const hiddenCols = statement.columns.length - visible.length;
  const selectedValue = cell ? rows[cell.r]?.[cell.c] : undefined;
  if (statement.rowCount === 0) {
    return (
      <div className="p-4 text-xs text-fg-3" data-testid="results-zero-rows">
        Query returned 0 rows. Columns: <span className="font-mono text-fg-2">{statement.columns.map((c) => c.name).join(', ')}</span>
      </div>
    );
  }
  return (
    <>
      {cell && selectedValue !== undefined && <CellInspector value={selectedValue} column={visible[cell.c]?.name ?? ''} onClose={() => setCell(null)} />}
      {hiddenCols > 0 && <p className="shrink-0 px-3 py-1 text-[11px] text-warn">{hiddenCols} more column(s) hidden (display limit {DISPLAY_LIMITS.maxVisibleColumns}); CSV export contains all columns.</p>}
      <div className="min-h-0 flex-1 overflow-auto scroll-thin" data-testid="results-grid">
        <table className="min-w-full border-separate border-spacing-0 font-mono text-xs">
          <thead className="sticky top-0 z-10 bg-panel-header">
            <tr>
              <th scope="col" className="sticky left-0 z-20 border-b border-r border-line bg-panel-header px-2 py-1.5 text-right text-[10px] font-normal text-fg-3">
                #
              </th>
              {visible.map((c, i) => (
                <th key={`${c.name}-${i}`} scope="col" className="whitespace-nowrap border-b border-r border-line px-2.5 py-1.5 text-left font-semibold text-fg" data-testid={`results-header-${i}`} title={`observed type: ${c.valueType}${c.containsNull ? ', contains NULL' : ''}`}>
                  {c.name}
                  <span className="ml-1.5 text-[9px] font-normal uppercase text-fg-3">{c.valueType === 'unknown' ? '' : c.valueType}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={offset + r} className="hover:bg-subtle/60" data-testid={`results-row-${offset + r}`}>
                <td className="sticky left-0 border-b border-r border-line bg-panel px-2 py-1 text-right text-[10px] text-fg-3">{offset + r + 1}</td>
                {visible.map((_, c) => {
                  const v = row[c] ?? null;
                  const f = formatCell(v, DISPLAY_LIMITS.maxCellChars);
                  const active = cell?.r === r && cell.c === c;
                  return (
                    <td key={c} className={`max-w-[360px] cursor-pointer truncate border-b border-r border-line px-2.5 py-1 ${f.kind === 'integer' || f.kind === 'real' || f.kind === 'int64' ? 'text-right' : ''} ${active ? 'outline outline-1 -outline-offset-1 outline-info' : ''}`} onClick={() => setCell({ r, c })} data-testid={`cell-${offset + r}-${c}`} data-kind={f.kind}>
                      <span className={KIND_CLASS[f.kind]}>{f.display}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
