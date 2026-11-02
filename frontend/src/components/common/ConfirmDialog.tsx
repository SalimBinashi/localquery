import type { ReactNode } from 'react';
import { Button } from '@/components/common/Button';
import { Dialog } from '@/components/common/Dialog';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly destructive?: boolean;
  readonly testId: string;
}

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel, destructive = false, testId }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      testId={testId}
      footer={
        <>
          <Button onClick={onCancel} data-testid={`${testId}-cancel`}>
            Cancel
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} data-testid={`${testId}-confirm`} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
