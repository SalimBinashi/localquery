import type { Config } from 'tailwindcss';

const v = (name: string): string => `var(--${name})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        app: v('bg-app'),
        panel: v('bg-panel'),
        'panel-header': v('bg-panel-header'),
        subtle: v('bg-subtle'),
        line: v('border-color'),
        focus: v('border-focus'),
        fg: v('text-primary'),
        'fg-2': v('text-secondary'),
        'fg-3': v('text-muted'),
        ok: v('accent-primary'),
        'ok-hover': v('accent-primary-hover'),
        info: v('accent-blue'),
        accent: v('accent-purple'),
        warn: v('accent-amber'),
        danger: v('accent-red'),
        'null-bg': v('null-badge'),
        'null-fg': v('null-text'),
        'blob-bg': v('blob-badge'),
        'blob-fg': v('blob-text'),
      },
    },
  },
  plugins: [],
} satisfies Config;
