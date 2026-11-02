export function LoadingIndicator({ label, testId }: { readonly label: string; readonly testId?: string }) {
  return (
    <span role="status" aria-live="polite" data-testid={testId} className="inline-flex items-center gap-2 font-mono text-xs text-fg-2">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-info" aria-hidden="true" />
      {label}
    </span>
  );
}
