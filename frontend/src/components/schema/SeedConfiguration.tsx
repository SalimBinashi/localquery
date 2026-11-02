import { Dices } from 'lucide-react';
import { Select } from '@/components/common/Select';
import { Tooltip } from '@/components/common/Tooltip';
import { useWorkspace } from '@/hooks/useWorkspace';
import { SEED_DENSITIES, SUPPORTED_LOCALES } from '@/types/workspace';

export function SeedConfiguration() {
  const { state, dispatch } = useWorkspace();
  const cfg = state.seedConfig;
  const disabled = !state.seedOnApply;
  return (
    <fieldset className="space-y-2.5 border-b border-line px-3 py-3" data-testid="seed-configuration">
      <legend className="sr-only">Mock data generation</legend>
      <div className="flex items-center justify-between">
        <span className="panel-title">Mock data</span>
        <label className="inline-flex items-center gap-1.5 text-xs text-fg-2">
          <input type="checkbox" checked={state.seedOnApply} onChange={(e) => dispatch({ type: 'SET_SEED_ON_APPLY', value: e.target.checked })} data-testid="seed-enabled-checkbox" className="accent-[var(--accent-primary)]" />
          Generate on apply
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Rows per eligible table" className="inline-flex overflow-hidden rounded-md border border-line">
          {SEED_DENSITIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={cfg.rowsPerTable === d}
              disabled={disabled}
              data-testid={`seed-density-${d}`}
              onClick={() => dispatch({ type: 'SET_SEED_CONFIG', patch: { rowsPerTable: d } })}
              className={`h-7 px-3 font-mono text-xs transition-colors disabled:opacity-50 ${cfg.rowsPerTable === d ? 'bg-info/15 text-info' : 'bg-subtle text-fg-2 hover:text-fg'}`}
            >
              {d}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-fg-2">
          <Tooltip content="Same schema + seed + locale + generator version always produce the same dataset.">
            <span className="cursor-help underline decoration-dotted underline-offset-2">Seed</span>
          </Tooltip>
          <input
            type="number"
            min={0}
            max={4294967295}
            value={cfg.randomSeed}
            disabled={disabled}
            data-testid="random-seed-input"
            aria-label="Random seed"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isSafeInteger(n) && n >= 0 && n <= 4294967295) dispatch({ type: 'SET_SEED_CONFIG', patch: { randomSeed: n } });
            }}
            className="h-7 w-24 rounded-md border border-line bg-subtle px-2 font-mono text-xs text-fg disabled:opacity-50"
          />
          <button type="button" aria-label="Randomize seed" disabled={disabled} data-testid="randomize-seed-button" onClick={() => dispatch({ type: 'SET_SEED_CONFIG', patch: { randomSeed: Math.floor(Math.random() * 1_000_000) } })} className="rounded p-1 text-fg-3 hover:bg-subtle hover:text-fg disabled:opacity-50">
            <Dices size={14} />
          </button>
        </label>
        <Select label="Locale" value={cfg.locale} disabled={disabled} data-testid="seed-locale-select" options={SUPPORTED_LOCALES.map((l) => ({ value: l, label: l }))} onChange={(e) => dispatch({ type: 'SET_SEED_CONFIG', patch: { locale: e.target.value as (typeof SUPPORTED_LOCALES)[number] } })} />
      </div>
      <p className="text-[11px] leading-snug text-fg-3">
        Target of <strong className="text-fg-2">{cfg.rowsPerTable} rows for every table that can be seeded safely</strong>. Virtual tables, unresolvable NOT NULL foreign-key cycles and missing parents are skipped and listed in the report; actual counts are always reported.
      </p>
    </fieldset>
  );
}
