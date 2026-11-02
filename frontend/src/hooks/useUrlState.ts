import { useCallback, useEffect, useRef, type Dispatch } from 'react';
import type { WorkspaceAction, WorkspaceState } from '@/app/providers/workspaceReducer';
import type { PlaygroundState } from '@/types/workspace';
import { buildShareUrl, readHash, writeHash, type ShareUrl } from '@/lib/sharing/UrlState';
import { URL_LIMITS } from '@/lib/limits';

export type ShareOutcome = { readonly ok: true; readonly share: ShareUrl } | { readonly ok: false; readonly reason: string; readonly share?: ShareUrl };

/**
 * URL hash sync. The hash is written only by the explicit Share action (pushState, no reload).
 * Back/Forward or manual hash edits restore editors only; they never rebuild the database or run SQL.
 */
export function useUrlState(state: WorkspaceState, dispatch: Dispatch<WorkspaceAction>, toState: (s: WorkspaceState) => PlaygroundState): () => ShareOutcome {
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastHandled = useRef(typeof window === 'undefined' ? '' : window.location.hash);

  useEffect(() => {
    const onNavigate = (): void => {
      const hash = window.location.hash;
      if (hash === lastHandled.current) return;
      lastHandled.current = hash;
      const decoded = readHash(hash);
      if (decoded.status === 'empty') return;
      if (decoded.status === 'invalid') {
        dispatch({ type: 'NOTICE', notice: { kind: 'warning', message: `Ignored workspace link: ${decoded.reason}` } });
        return;
      }
      dispatch({ type: 'RESTORE_WORKSPACE', state: decoded.state });
      dispatch({ type: 'NOTICE', notice: { kind: 'info', message: 'Editors were restored from the URL. Apply the schema to rebuild the database.', action: 'apply-schema' } });
    };
    window.addEventListener('hashchange', onNavigate);
    window.addEventListener('popstate', onNavigate);
    return () => {
      window.removeEventListener('hashchange', onNavigate);
      window.removeEventListener('popstate', onNavigate);
    };
  }, [dispatch]);

  return useCallback((): ShareOutcome => {
    let share: ShareUrl;
    try {
      share = buildShareUrl(toState(stateRef.current));
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'The workspace could not be serialized.' };
    }
    if (share.tooLong) return { ok: false, reason: `The share link would be ${share.length.toLocaleString()} characters, above the ${URL_LIMITS.maxUrlLength.toLocaleString()}-character limit for reliable sharing. Reduce the schema or query size, or export the database/SQL dump instead.`, share };
    lastHandled.current = share.hash;
    writeHash(share.hash);
    dispatch({ type: 'SHARED', hash: share.hash });
    return { ok: true, share };
  }, [dispatch, toState]);
}
