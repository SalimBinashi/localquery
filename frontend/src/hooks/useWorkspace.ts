import { useContext, useMemo } from 'react';
import { WorkspaceContext, type WorkspaceContextValue } from '@/app/providers/WorkspaceProvider';
import { toPlaygroundState } from '@/app/providers/workspaceReducer';
import { serializeState } from '@/lib/sharing/UrlState';

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}

export type WorkspaceSyncStatus = 'schema-edited' | 'db-diverged' | 'shared' | 'local';

/** How the live database relates to the editors and the last share link. */
export function useWorkspaceSyncStatus(): WorkspaceSyncStatus {
  const { state } = useWorkspace();
  return useMemo(() => {
    if (state.applied && state.applied.text !== state.schemaText) return 'schema-edited';
    if (state.dbDirty) return 'db-diverged';
    if (state.lastSharedHash) {
      try {
        if (`#${serializeState(toPlaygroundState(state))}` === state.lastSharedHash) return 'shared';
      } catch {
        return 'local';
      }
    }
    return 'local';
  }, [state]);
}
