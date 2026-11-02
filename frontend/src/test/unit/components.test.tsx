// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ResultsTable } from '@/components/results/ResultsTable';
import { ErrorDisplay } from '@/components/results/ErrorDisplay';
import type { StatementResult } from '@/types/query';

const statement: StatementResult = {
  index: 0,
  sql: 'SELECT …',
  line: 1,
  statementType: 'SELECT',
  returnsRows: true,
  columns: ['n', 's', 'z', 'b', 'html'].map((name) => ({ name, declaredType: null, valueType: 'mixed', containsNull: false })),
  rows: [[null, 'NULL', 0, new Uint8Array([222, 173]), '<img src=x onerror=alert(1)>']],
  rowCount: 1,
  retainedRowCount: 1,
  truncated: false,
  changes: null,
  executionMs: 0.1,
};

describe('ResultsTable', () => {
  it('renders NULL distinctly from the string "NULL", zero and BLOBs, and never injects HTML', () => {
    const { container } = render(<ResultsTable statement={statement} rows={statement.rows} offset={0} />);
    expect(screen.getByTestId('cell-0-0').dataset.kind).toBe('null');
    expect(screen.getByTestId('cell-0-1').dataset.kind).toBe('text');
    expect(screen.getByTestId('cell-0-2')).toHaveTextContent('0');
    expect(screen.getByTestId('cell-0-3')).toHaveTextContent('BLOB 2 B · dead');
    expect(container.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByTestId('cell-0-3'));
    expect(screen.getByTestId('cell-inspector-value')).toHaveTextContent('\\xdead');
  });
  it('shows a zero-row state with column names', () => {
    render(<ResultsTable statement={{ ...statement, rows: [], rowCount: 0, retainedRowCount: 0 }} rows={[]} offset={0} />);
    expect(screen.getByTestId('results-zero-rows')).toHaveTextContent('n, s, z, b, html');
  });
});

describe('ErrorDisplay', () => {
  it('shows category, position and message as text', () => {
    render(<ErrorDisplay testId="e" error={{ category: 'syntax', message: 'near "x": syntax error', line: 2, column: 5, statementIndex: 1, recoverable: true }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('SQL syntax error');
    expect(screen.getByRole('alert')).toHaveTextContent('statement 2, line 2, col 5');
  });
});
