import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select } from '@/components/common/Select';
import { DISPLAY_LIMITS } from '@/lib/limits';

export interface ResultsPaginationProps {
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly onPage: (page: number) => void;
  readonly onPageSize: (size: number) => void;
}

/** Client-side pagination over the already-materialized (retained) rows; the SQL is never rewritten. */
export function ResultsPagination({ total, page, pageSize, onPage, onPageSize }: ResultsPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-t border-line bg-panel-header px-3 text-[11px] text-fg-2">
      <span className="font-mono" data-testid="pagination-range">
        {from}–{to} of {total.toLocaleString()} retained
      </span>
      <Select label="Rows per page" hideLabel value={String(pageSize)} data-testid="page-size-select" options={DISPLAY_LIMITS.pageSizes.map((n) => ({ value: String(n), label: `${n} / page` }))} onChange={(e) => onPageSize(Number(e.target.value))} />
      <div className="ml-auto flex items-center gap-1">
        <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)} className="rounded p-1 hover:bg-subtle disabled:opacity-40" data-testid="pagination-prev">
          <ChevronLeft size={14} />
        </button>
        <span className="font-mono" data-testid="pagination-page">
          {page + 1}/{pages}
        </span>
        <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} className="rounded p-1 hover:bg-subtle disabled:opacity-40" data-testid="pagination-next">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
