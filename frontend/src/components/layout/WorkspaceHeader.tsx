import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Database, Download, FileCode2, Moon, RotateCcw, Sun, Upload } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { AboutDialog } from '@/components/layout/AboutDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DbStatusPill, WorkspaceStatusPill } from '@/components/sharing/ShareStatus';
import { ShareWorkspaceButton } from '@/components/sharing/ShareWorkspaceDialog';
import { useWorkspace, useWorkspaceSyncStatus } from '@/hooks/useWorkspace';
import { displayStatus } from '@/app/providers/workspaceReducer';
import type { Theme } from '@/hooks/useTheme';

function DataMenu() {
  const { state, actions } = useWorkspace();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const disabled = state.engineStatus !== 'ready' || state.busy !== null;
  const item = (label: string, hint: string, icon: React.ReactNode, onClick: () => void, testId: string) => (
    <button type="button" role="menuitem" disabled={disabled} data-testid={testId} onClick={() => { setOpen(false); onClick(); }} className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-subtle disabled:opacity-50">
      <span className="mt-0.5 text-fg-2">{icon}</span>
      <span>
        <span className="block text-fg">{label}</span>
        <span className="block text-[11px] text-fg-3">{hint}</span>
      </span>
    </button>
  );
  return (
    <div ref={root} className="relative">
      <Button icon={<Database size={13} />} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="data-menu-button">
        <span className="hidden md:inline">Database</span>
        <ChevronDown size={12} />
      </Button>
      {open && (
        <div role="menu" className="animate-fade-in absolute right-0 z-50 mt-1 w-72 overflow-hidden rounded-md border border-line bg-panel shadow-2xl">
          {item('Export .sqlite file', 'Full binary database backup (all current data).', <Download size={13} />, () => void actions.exportDatabase(), 'export-db-button')}
          {item('Export SQL dump', 'Schema + INSERT statements as a .sql script.', <FileCode2 size={13} />, () => void actions.exportSqlDump(), 'export-sql-dump-button')}
          {item('Import .sqlite file', 'Replaces the in-memory database (validated, max 50 MB).', <Upload size={13} />, () => file.current?.click(), 'import-db-button')}
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3,application/x-sqlite3"
        className="hidden"
        data-testid="import-db-input"
        aria-label="Import SQLite database file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void actions.importDatabase(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function WorkspaceHeader({ theme, onToggleTheme }: { readonly theme: Theme; readonly onToggleTheme: () => void }) {
  const { state, actions } = useWorkspace();
  const sync = useWorkspaceSyncStatus();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <header data-testid="app-header" className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-6 w-6" />
        <div className="min-w-0">
          <h1 className="truncate font-mono text-sm font-bold tracking-tight text-fg">Local-First SQLite Playground</h1>
          <p className="hidden truncate text-[11px] text-fg-3 md:block">SQLite {state.sqliteVersion ?? ''} running locally in your browser (WebAssembly) — nothing leaves this tab.</p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <DbStatusPill status={displayStatus(state)} />
        <WorkspaceStatusPill status={sync} />
        <ShareWorkspaceButton />
        <DataMenu />
        <Button variant="ghost" icon={<RotateCcw size={13} />} onClick={() => setConfirmReset(true)} disabled={state.busy !== null} data-testid="reset-workspace-button" title="Reset to the default example workspace">
          <span className="hidden md:inline">Reset</span>
        </Button>
        <AboutDialog />
        <Button variant="ghost" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} data-testid="theme-toggle-button" icon={theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} />
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="Reset workspace?"
        confirmLabel="Reset everything"
        destructive
        testId="reset-confirm-dialog"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          void actions.resetWorkspace();
        }}
      >
        <p>This will:</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>replace both editors with the default example schema and query,</li>
          <li>discard the in-memory database and rebuild it from the example (unexported data is lost),</li>
          <li>clear this session&apos;s query history,</li>
          <li>remove the workspace from the URL.</li>
        </ul>
        {state.dbDirty && <p className="mt-2 text-warn">The current database has changes that are not in any share link.</p>}
      </ConfirmDialog>
    </header>
  );
}
