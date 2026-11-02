import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ok text-white border-transparent hover:bg-ok-hover',
  secondary: 'bg-subtle text-fg border-line hover:border-fg-3',
  ghost: 'bg-transparent text-fg-2 border-transparent hover:bg-subtle hover:text-fg',
  danger: 'bg-transparent text-danger border-line hover:bg-danger/10 hover:border-danger',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly icon?: ReactNode;
  readonly size?: 'sm' | 'md';
}

export function Button({ variant = 'secondary', icon, size = 'sm', className = '', children, type = 'button', ...rest }: ButtonProps) {
  const sizing = size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm';
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
