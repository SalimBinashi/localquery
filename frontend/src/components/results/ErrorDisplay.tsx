import { AlertTriangle, Ban, Bug, Database, FileWarning, KeyRound, ServerCrash, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ErrorCategory, SQLiteErrorInfo } from '@/types/query';

const LABELS: Record<ErrorCategory, { label: string; icon: ReactNode }> = {
  syntax: { label: 'SQL syntax error', icon: <FileWarning size={14} /> },
  constraint: { label: 'Constraint violation', icon: <KeyRound size={14} /> },
  schema: { label: 'Schema / missing object', icon: <Database size={14} /> },
  validation: { label: 'Invalid input', icon: <AlertTriangle size={14} /> },
  initialization: { label: 'Engine initialization failed', icon: <ServerCrash size={14} /> },
  resource: { label: 'Resource limit', icon: <Timer size={14} /> },
  execution: { label: 'Execution error', icon: <AlertTriangle size={14} /> },
  cancelled: { label: 'Cancelled', icon: <Ban size={14} /> },
  internal: { label: 'Internal error', icon: <Bug size={14} /> },
};

export function ErrorDisplay({ error, testId, footer }: { readonly error: SQLiteErrorInfo; readonly testId: string; readonly footer?: ReactNode }) {
  const meta = LABELS[error.category];
  const where = [error.statementIndex !== undefined ? `statement ${error.statementIndex + 1}` : null, error.line !== undefined ? `line ${error.line}` : null, error.column !== undefined ? `col ${error.column}` : null].filter(Boolean).join(', ');
  return (
    <div role="alert" data-testid={testId} data-category={error.category} className="animate-fade-in rounded-md border border-danger/40 bg-danger/10 p-3 text-xs">
      <div className="flex items-center gap-2 font-semibold text-danger">
        {meta.icon}
        <span>{meta.label}</span>
        {error.code && <span className="rounded bg-danger/15 px-1.5 py-0.5 font-mono text-[10px]">{error.code}</span>}
        {where && <span className="ml-auto font-mono text-[11px] font-normal text-fg-2">{where}</span>}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words font-mono text-fg" data-testid={`${testId}-message`}>
        {error.message}
      </p>
      {error.hint && <p className="mt-1 text-fg-2">{error.hint}</p>}
      {error.statement && (
        <pre className="mt-2 max-h-24 overflow-auto rounded border border-line bg-panel p-2 font-mono text-[11px] text-fg-2 scroll-thin">{error.statement}</pre>
      )}
      {footer}
    </div>
  );
}
