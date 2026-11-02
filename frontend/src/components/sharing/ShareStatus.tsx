import type { EngineStatus } from '@/app/providers/workspaceReducer';
import type { WorkspaceSyncStatus } from '@/hooks/useWorkspace';

const DB: Record<EngineStatus, { label: string; cls: string; dot: string }> = {
  initializing: { label: 'Initializing WASM', cls: 'border-warn/40 bg-warn/10 text-warn', dot: 'bg-warn animate-pulse' },
  ready: { label: 'Ready', cls: 'border-ok/40 bg-ok/10 text-ok-hover', dot: 'bg-ok-hover' },
  executing: { label: 'Executing', cls: 'border-info/40 bg-info/10 text-info', dot: 'bg-info animate-pulse' },
  error: { label: 'Error', cls: 'border-danger/40 bg-danger/10 text-danger', dot: 'bg-danger' },
  disposed: { label: 'Disposed', cls: 'border-line bg-subtle text-fg-3', dot: 'bg-fg-3' },
};

const WS: Record<WorkspaceSyncStatus, { label: string; title: string; cls: string }> = {
  'schema-edited': { label: 'Schema edits not applied', title: 'The schema editor differs from the database that is currently built.', cls: 'border-warn/40 text-warn' },
  'db-diverged': { label: 'DB changes not in link', title: 'The database was changed by queries or an import. A share link only rebuilds it from schema + seed.', cls: 'border-accent/40 text-accent' },
  shared: { label: 'Link up to date', title: 'The URL contains the current schema, query and seed settings.', cls: 'border-ok/40 text-ok-hover' },
  local: { label: 'Local workspace', title: 'Use Share to put the current workspace into the URL.', cls: 'border-line text-fg-2' },
};

export function DbStatusPill({ status }: { readonly status: EngineStatus }) {
  const s = DB[status];
  return (
    <span role="status" aria-live="polite" data-testid="db-status-pill" data-status={status} className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      <span className="sr-only">Database status: </span>
      {s.label}
    </span>
  );
}

export function WorkspaceStatusPill({ status }: { readonly status: WorkspaceSyncStatus }) {
  const s = WS[status];
  return (
    <span title={s.title} data-testid="workspace-status-pill" data-status={status} className={`hidden h-6 items-center rounded-full border px-2.5 font-mono text-[10px] uppercase tracking-wide lg:inline-flex ${s.cls}`}>
      {s.label}
    </span>
  );
}
