import { CheckCircle2, X, XCircle } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { formatMs } from '@/lib/performance/performanceMetrics';

/** Session-only history (never persisted or put in share links). */
export function QueryHistory({ onClose }: { readonly onClose: () => void }) {
  const { state, dispatch } = useWorkspace();
  return (
    <div className="animate-fade-in absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-line bg-panel shadow-2xl" data-testid="query-history-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="panel-title">History · this session only</span>
        <div className="flex items-center gap-2">
          {state.history.length > 0 && (
            <button type="button" className="text-[11px] text-fg-3 hover:text-fg" onClick={() => dispatch({ type: 'HISTORY_CLEAR' })} data-testid="clear-history-button">
              Clear
            </button>
          )}
          <button type="button" aria-label="Close history" onClick={onClose} className="rounded p-0.5 text-fg-3 hover:text-fg" data-testid="close-history-button">
            <X size={14} />
          </button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto scroll-thin">
        {state.history.length === 0 && <li className="p-3 text-xs text-fg-3">No queries run yet.</li>}
        {state.history.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              className="block w-full border-b border-line px-3 py-2 text-left hover:bg-subtle"
              data-testid={`history-entry-${h.id}`}
              onClick={() => {
                dispatch({ type: 'EDIT_QUERY', text: h.sql });
                onClose();
              }}
            >
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-fg-3">
                {h.ok ? <CheckCircle2 size={11} className="text-ok-hover" /> : <XCircle size={11} className="text-danger" />}
                {new Date(h.executedAt).toLocaleTimeString()} · {formatMs(h.durationMs)}
                {h.rowCount !== null && ` · ${h.rowCount} rows`}
              </span>
              <span className="mt-0.5 line-clamp-2 block font-mono text-[11px] text-fg">{h.sql}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
