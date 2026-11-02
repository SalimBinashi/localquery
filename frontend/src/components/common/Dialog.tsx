import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly testId?: string;
  readonly wide?: boolean;
}

/** Native <dialog> (modal focus trap, Esc to close, inert background). */
export function Dialog({ open, title, onClose, children, footer, testId, wide = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${testId ?? 'dialog'}-title`}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-lg border border-line bg-panel p-0 text-fg shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
    >
      {open && (
        <div className="animate-fade-in">
          <div className="flex items-center justify-between border-b border-line bg-panel-header px-4 py-2.5">
            <h2 id={`${testId ?? 'dialog'}-title`} className="text-sm font-semibold">
              {title}
            </h2>
            <button type="button" aria-label="Close dialog" onClick={onClose} className="rounded p-1 text-fg-3 hover:bg-subtle hover:text-fg" data-testid={`${testId ?? 'dialog'}-close`}>
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-auto px-4 py-3 text-sm text-fg-2 scroll-thin">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
