import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  readonly label: string;
  readonly options: readonly SelectOption[];
  readonly hideLabel?: boolean;
}

export function Select({ label, options, hideLabel = false, id, className = '', ...rest }: SelectProps) {
  const selectId = id ?? `select-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={selectId} className="inline-flex items-center gap-2 text-xs text-fg-2">
      <span className={hideLabel ? 'sr-only' : ''}>{label}</span>
      <select id={selectId} className={`h-7 rounded-md border border-line bg-subtle px-2 font-mono text-xs text-fg hover:border-fg-3 ${className}`} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
