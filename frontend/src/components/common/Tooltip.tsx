import { useId, type ReactNode } from 'react';

export interface TooltipProps {
  readonly content: string;
  readonly children: ReactNode;
  readonly side?: 'top' | 'bottom';
}

/** Lightweight tooltip shown on hover and keyboard focus; linked via aria-describedby. */
export function Tooltip({ content, children, side = 'bottom' }: TooltipProps) {
  const id = useId();
  return (
    <span className="group relative inline-flex" aria-describedby={id}>
      {children}
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-[260px] -translate-x-1/2 rounded border border-line bg-panel-header px-2 py-1 text-[11px] leading-snug text-fg-2 opacity-0 shadow-lg transition-opacity duration-150 group-has-[:focus-visible]:opacity-100 group-hover:opacity-100 ${side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5'}`}
      >
        {content}
      </span>
    </span>
  );
}
