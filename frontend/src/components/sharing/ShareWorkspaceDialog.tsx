import { useRef, useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Dialog } from '@/components/common/Dialog';
import { useWorkspace } from '@/hooks/useWorkspace';
import { copyText } from '@/lib/utils/clipboard';
import type { ShareOutcome } from '@/hooks/useUrlState';
import { URL_LIMITS } from '@/lib/limits';

type CopyState = { readonly status: 'idle' | 'copying' } | { readonly status: 'copied' } | { readonly status: 'failed'; readonly reason: string };

export function ShareWorkspaceButton() {
  const { state, actions } = useWorkspace();
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const [copy, setCopy] = useState<CopyState>({ status: 'idle' });
  const manual = useRef<HTMLInputElement>(null);

  const share = async (): Promise<void> => {
    const result = actions.share();
    setOutcome(result);
    if (!result.ok) return;
    setCopy({ status: 'copying' });
    const c = await copyText(result.share.url);
    setCopy(c.ok ? { status: 'copied' } : { status: 'failed', reason: c.reason });
  };

  return (
    <>
      <Button variant="primary" icon={<Link2 size={13} />} onClick={() => void share()} data-testid="share-workspace-button" title="Put schema, query and seed settings into the URL and copy it">
        <span className="hidden sm:inline">Share</span>
      </Button>
      <Dialog open={outcome !== null} title="Share workspace" onClose={() => setOutcome(null)} testId="share-dialog">
        {outcome && !outcome.ok && (
          <p role="alert" data-testid="share-error" className="text-danger">
            {outcome.reason}
          </p>
        )}
        {outcome?.ok && (
          <div className="space-y-3">
            <div aria-live="polite" data-testid="share-copy-status" data-status={copy.status}>
              {copy.status === 'copying' && <span>Copying link…</span>}
              {copy.status === 'copied' && (
                <span className="inline-flex items-center gap-1.5 text-ok-hover">
                  <Check size={14} /> Link copied to clipboard. The URL in the address bar was updated too.
                </span>
              )}
              {copy.status === 'failed' && <span className="text-warn">Could not copy automatically ({copy.reason}). Copy the link manually below.</span>}
            </div>
            <div className="flex gap-2">
              <input
                ref={manual}
                readOnly
                aria-label="Shareable workspace URL"
                value={outcome.share.url}
                onFocus={(e) => e.currentTarget.select()}
                data-testid="share-url-input"
                className="h-8 min-w-0 flex-1 rounded-md border border-line bg-app px-2 font-mono text-[11px] text-fg"
              />
              <Button icon={<Copy size={13} />} onClick={() => manual.current?.select()} data-testid="share-select-url-button">
                Select
              </Button>
            </div>
            <p className="font-mono text-[11px] text-fg-3" data-testid="share-url-length">
              {outcome.share.length.toLocaleString()} / {URL_LIMITS.maxUrlLength.toLocaleString()} characters
              {outcome.share.nearLimit && <span className="ml-2 text-warn">Approaching the URL size limit.</span>}
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs">
              <li>The link contains the schema text, the query text and the seed settings (density, random seed {state.seedConfig.randomSeed}, locale). It is compressed into the URL fragment, which browsers do not send to servers.</li>
              <li>Opening it fills the editors; the recipient applies the schema to deterministically rebuild the same mock dataset. The query is never run automatically.</li>
              {state.dbDirty && <li className="text-warn">The live database has changes from queries or an import. These are NOT in the link — export the database or a SQL dump to share them.</li>}
            </ul>
          </div>
        )}
      </Dialog>
    </>
  );
}
