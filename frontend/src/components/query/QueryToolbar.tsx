import { Eraser, History, Play } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Select } from '@/components/common/Select';
import { Tooltip } from '@/components/common/Tooltip';
import { useWorkspace } from '@/hooks/useWorkspace';
import { EXAMPLE_QUERIES } from '@/lib/defaults';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export interface QueryToolbarProps {
  readonly onRun: () => void;
  readonly historyOpen: boolean;
  readonly onToggleHistory: () => void;
}

export function QueryToolbar({ onRun, historyOpen, onToggleHistory }: QueryToolbarProps) {
  const { state, dispatch } = useWorkspace();
  const running = state.busy === 'query';
  const canRun = state.engineStatus === 'ready' && state.busy === null && state.queryText.trim() !== '';
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-panel-header px-3">
      <h2 className="panel-title mr-1 hidden sm:block">Query</h2>
      <Tooltip content={`Runs every statement in the editor against the live database (${isMac ? '⌘' : 'Ctrl'}+Enter).`}>
        <Button variant="primary" icon={<Play size={12} />} onClick={onRun} disabled={!canRun} aria-busy={running} data-testid="run-query-button">
          {running ? 'Running…' : 'Run'}
          <kbd className="ml-1 hidden rounded border border-white/30 px-1 font-mono text-[9px] md:inline">{isMac ? '⌘↵' : 'Ctrl↵'}</kbd>
        </Button>
      </Tooltip>
      <Button variant="ghost" icon={<Eraser size={12} />} onClick={() => dispatch({ type: 'EDIT_QUERY', text: '' })} data-testid="clear-query-button">
        <span className="hidden sm:inline">Clear</span>
      </Button>
      <Select
        label="Insert example query"
        hideLabel
        value=""
        data-testid="example-queries-select"
        className="max-w-[170px]"
        options={[{ value: '', label: 'Examples…' }, ...EXAMPLE_QUERIES.map((q, i) => ({ value: String(i), label: q.label }))]}
        onChange={(e) => {
          const q = EXAMPLE_QUERIES[Number(e.target.value)];
          if (e.target.value !== '' && q) dispatch({ type: 'EDIT_QUERY', text: q.sql });
        }}
      />
      <Button variant="ghost" icon={<History size={12} />} onClick={onToggleHistory} aria-expanded={historyOpen} data-testid="query-history-button" className="ml-auto">
        <span className="hidden sm:inline">History</span>
        <span className="font-mono text-[10px] text-fg-3">{state.history.length}</span>
      </Button>
    </div>
  );
}
