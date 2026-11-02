import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { useWorkspace } from '@/hooks/useWorkspace';
import { formatMs } from '@/lib/performance/performanceMetrics';

const ICON = { info: <Info size={14} />, warning: <AlertTriangle size={14} />, error: <XCircle size={14} />, success: <CheckCircle2 size={14} /> };
const TONE = { info: 'border-info/40 text-info', warning: 'border-warn/40 text-warn', error: 'border-danger/40 text-danger', success: 'border-ok/40 text-ok-hover' };

export function WorkspaceNotices() {
  const { state, dispatch, actions } = useWorkspace();
  return (
    <div className="shrink-0 space-y-1 empty:hidden [&:not(:empty)]:border-b [&:not(:empty)]:border-line [&:not(:empty)]:px-3 [&:not(:empty)]:py-1.5" aria-live="polite">
      {state.engineError && (
        <div role="alert" data-testid="engine-error-banner" className="flex flex-wrap items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          <XCircle size={14} />
          <span className="min-w-0 flex-1">{state.engineError.message}</span>
          <Button onClick={() => void actions.restartEngine()} data-testid="engine-retry-button">
            Retry initialization
          </Button>
        </div>
      )}
      {state.stall && (
        <div role="alert" data-testid="worker-stall-banner" className="flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn">
          <AlertTriangle size={14} />
          <span className="min-w-0 flex-1">
            The SQLite worker has been busy for {formatMs(state.stall.elapsedMs)} ({state.stall.type}). SQLite in WebAssembly cannot interrupt a running statement. You can keep waiting, or terminate the worker — this discards the in-memory database and rebuilds the last applied schema.
          </span>
          <Button variant="danger" onClick={() => void actions.restartEngine()} data-testid="worker-terminate-button">
            Terminate &amp; rebuild
          </Button>
        </div>
      )}
      {state.notices.map((n) => (
        <div key={n.id} data-testid={`notice-${n.kind}`} className={`animate-fade-in flex flex-wrap items-center gap-2 rounded-md border bg-panel px-3 py-1.5 text-xs ${TONE[n.kind]}`}>
          {ICON[n.kind]}
          <span className="min-w-0 flex-1 text-fg-2">{n.message}</span>
          {n.action === 'apply-schema' && (
            <Button variant="primary" disabled={state.engineStatus !== 'ready' || state.busy !== null} onClick={() => void actions.applySchema()} data-testid="notice-apply-schema-button">
              Build database now
            </Button>
          )}
          <button type="button" aria-label="Dismiss notice" onClick={() => dispatch({ type: 'DISMISS_NOTICE', id: n.id })} className="rounded p-0.5 text-fg-3 hover:text-fg" data-testid="notice-dismiss-button">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
