import type { ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

function Handle({ direction }: { readonly direction: 'horizontal' | 'vertical' }) {
  return (
    <PanelResizeHandle
      className={`group relative flex items-center justify-center bg-line transition-colors hover:bg-info data-[resize-handle-state=drag]:bg-info ${direction === 'horizontal' ? 'w-px' : 'h-px'}`}
      data-testid={`resize-handle-${direction}`}
    >
      <span className={`absolute ${direction === 'horizontal' ? 'inset-y-0 -left-1 -right-1' : 'inset-x-0 -top-1 -bottom-1'}`} />
    </PanelResizeHandle>
  );
}

export interface ResizablePanelsProps {
  readonly left: ReactNode;
  readonly top: ReactNode;
  readonly bottom: ReactNode;
}

/** Desktop/tablet three-pane layout: schema (left) | query (top-right) / inspector (bottom-right). */
export function ResizablePanels({ left, top, bottom }: ResizablePanelsProps) {
  return (
    <PanelGroup direction="horizontal" autoSaveId="playground-h" className="min-h-0 flex-1">
      <Panel defaultSize={36} minSize={22} className="flex min-w-0 flex-col">
        {left}
      </Panel>
      <Handle direction="horizontal" />
      <Panel minSize={35} className="flex min-w-0 flex-col">
        <PanelGroup direction="vertical" autoSaveId="playground-v">
          <Panel defaultSize={42} minSize={18} className="flex min-h-0 flex-col">
            {top}
          </Panel>
          <Handle direction="vertical" />
          <Panel minSize={20} className="flex min-h-0 flex-col">
            {bottom}
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
