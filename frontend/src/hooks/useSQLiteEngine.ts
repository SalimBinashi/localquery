import { useEffect, useRef, type Dispatch, type MutableRefObject } from 'react';
import { SQLiteWorkerClient } from '@/lib/sqlite/SQLiteWorkerClient';
import { normalizeError } from '@/lib/sqlite/sqliteErrors';
import type { WorkspaceAction } from '@/app/providers/workspaceReducer';

/** Owns exactly one live worker client per mounted provider (Strict Mode safe: the first instance is disposed). */
export function useSQLiteEngine(dispatch: Dispatch<WorkspaceAction>, onReady: (client: SQLiteWorkerClient) => void): MutableRefObject<SQLiteWorkerClient | null> {
  const clientRef = useRef<SQLiteWorkerClient | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    let active = true;
    const client = new SQLiteWorkerClient(() => new Worker(new URL('../workers/sqlite.worker.ts', import.meta.url), { type: 'module', name: 'sqlite-engine' }), {
      onProgress: (p) => active && dispatch({ type: 'PROGRESS', detail: p.detail }),
      onFatal: (error) => active && dispatch({ type: 'ENGINE_FATAL', error }),
      onStall: (stall) => active && dispatch({ type: 'ENGINE_STALL', stall: stall ? { type: stall.type, elapsedMs: stall.elapsedMs } : null }),
    });
    clientRef.current = client;
    dispatch({ type: 'ENGINE_INIT_START' });
    client.initialize().then(
      (r) => {
        if (!active) return;
        dispatch({ type: 'ENGINE_READY', initMs: r.durationMs, version: r.sqliteVersion });
        onReadyRef.current(client);
      },
      (e: unknown) => {
        if (!active) return;
        dispatch({ type: 'ENGINE_FATAL', error: { ...normalizeError(e, { phase: 'init' }), category: 'initialization' } });
      },
    );
    return () => {
      active = false;
      clientRef.current = null;
      void client.dispose();
    };
  }, [dispatch]);
  return clientRef;
}
