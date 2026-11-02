import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Dialog } from '@/components/common/Dialog';

/** In-app privacy model and engine limitations. */
export function AboutDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" icon={<ShieldCheck size={14} />} onClick={() => setOpen(true)} data-testid="privacy-button" aria-label="Privacy and limitations">
        <span className="hidden xl:inline">Privacy</span>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Privacy model & limitations" testId="privacy-dialog" wide>
        <div className="space-y-3 text-xs leading-relaxed">
          <section>
            <h3 className="mb-1 font-semibold text-fg">Where your data lives</h3>
            <ul className="list-disc space-y-1 pl-4">
              <li>SQLite (sql.js, WebAssembly) runs in a dedicated Web Worker inside this tab. Schema, generated rows, queries and results never leave your browser — there is no backend, account, analytics or telemetry.</li>
              <li>The database is in memory only. Reloading or closing the tab discards it unless you export a <code>.sqlite</code> file or SQL dump.</li>
              <li>Share links store schema text, query text and seed settings in the URL fragment (<code>#ws1.…</code>). Fragments are not sent to web servers, but anyone you give the link to can read its contents.</li>
              <li>Only the app&apos;s own static files (JS, CSS, fonts, the WASM binary) are downloaded. Workspace content never triggers remote requests.</li>
            </ul>
          </section>
          <section>
            <h3 className="mb-1 font-semibold text-fg">Engine limitations (sql.js 1.13 / SQLite 3.49)</h3>
            <ul className="list-disc space-y-1 pl-4">
              <li>FTS3 is available; FTS5, R*Tree and loadable extensions are not compiled in.</li>
              <li>A running statement cannot be interrupted. A stalled worker can be terminated, which discards the in-memory database and rebuilds the last applied schema.</li>
              <li>Result-column declared types are not exposed by sql.js; the grid shows observed storage classes. Integers beyond ±2^53 are shown as exact text.</li>
              <li>Results keep at most 5,000 rows / 8 MB per statement for display and export; the query itself always runs to completion and the true row count is reported.</li>
            </ul>
          </section>
        </div>
      </Dialog>
    </>
  );
}
