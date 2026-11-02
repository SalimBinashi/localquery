import { useState } from 'react';
import { Tabs } from '@/components/common/Tabs';
import { ResizablePanels } from '@/components/layout/ResizablePanels';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { WorkspaceNotices } from '@/components/layout/WorkspaceNotices';
import { SchemaEditor } from '@/components/schema/SchemaEditor';
import { QueryPane } from '@/components/query/QueryPane';
import { InspectorPane } from '@/components/results/InspectorPane';
import { useMediaQuery, useTheme } from '@/hooks/useTheme';

type MobilePane = 'schema' | 'query' | 'inspect';

export function AppShell() {
  const { theme, toggle } = useTheme();
  const narrow = useMediaQuery('(max-width: 767px)');
  const [pane, setPane] = useState<MobilePane>('query');
  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="app-shell" data-layout={narrow ? 'stacked' : 'panels'}>
      <WorkspaceHeader theme={theme} onToggleTheme={toggle} />
      <WorkspaceNotices />
      {narrow ? (
        <>
          <nav className="shrink-0 border-b border-line bg-panel px-1" aria-label="Workspace panes">
            <Tabs<MobilePane>
              label="Workspace panes"
              idPrefix="mobile"
              value={pane}
              onChange={setPane}
              items={[
                { id: 'schema', label: 'Schema', testId: 'mobile-tab-schema' },
                { id: 'query', label: 'Query', testId: 'mobile-tab-query' },
                { id: 'inspect', label: 'Results', testId: 'mobile-tab-results' },
              ]}
            />
          </nav>
          <main className="min-h-0 flex-1">
            <section id="mobile-panel-schema" role="tabpanel" aria-labelledby="mobile-tab-schema" hidden={pane !== 'schema'} className="h-full flex-col [&:not([hidden])]:flex">
              <SchemaEditor />
            </section>
            <section id="mobile-panel-query" role="tabpanel" aria-labelledby="mobile-tab-query" hidden={pane !== 'query'} className="h-full flex-col [&:not([hidden])]:flex">
              <QueryPane onRan={() => setPane('inspect')} />
            </section>
            <section id="mobile-panel-inspect" role="tabpanel" aria-labelledby="mobile-tab-inspect" hidden={pane !== 'inspect'} className="h-full flex-col [&:not([hidden])]:flex">
              <InspectorPane />
            </section>
          </main>
        </>
      ) : (
        <main className="flex min-h-0 flex-1">
          <ResizablePanels left={<SchemaEditor />} top={<QueryPane />} bottom={<InspectorPane />} />
        </main>
      )}
    </div>
  );
}
