import { CheckCircle2, AlertTriangle, KeyRound, Link } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { formatMs } from '@/lib/performance/performanceMetrics';
import type { SeedReport } from '@/lib/seeding/seedTypes';

function SeedReportView({ report }: { readonly report: SeedReport }) {
  return (
    <div className="space-y-2" data-testid="seed-report">
      <div className="flex items-center gap-2 text-xs">
        {report.allTargetsMet ? <CheckCircle2 size={14} className="text-ok-hover" /> : <AlertTriangle size={14} className="text-warn" />}
        <span className="text-fg" data-testid="seed-report-summary">
          {report.totalInserted.toLocaleString()} rows inserted · {report.relationshipsValidated} FK relationship(s) validated · {report.foreignKeyViolations} violations · {formatMs(report.durationMs)}
        </span>
      </div>
      <table className="w-full font-mono text-[11px]">
        <thead className="text-fg-3">
          <tr>
            <th className="py-1 text-left font-normal">table</th>
            <th className="text-right font-normal">target</th>
            <th className="text-right font-normal">inserted</th>
            <th className="text-right font-normal" title="Generated rows rejected by SQLite and retried">rejected</th>
          </tr>
        </thead>
        <tbody>
          {report.tables.map((t) => (
            <tr key={t.table} className="border-t border-line align-top" data-testid={`seed-report-row-${t.table}`}>
              <td className="py-1 pr-2 text-fg">
                {t.table}
                {t.reasons.map((r) => (
                  <div key={r} className={`font-sans text-[11px] ${t.skipped ? 'text-warn' : 'text-fg-3'}`}>
                    {t.skipped ? 'Skipped: ' : ''}
                    {r}
                  </div>
                ))}
              </td>
              <td className="text-right text-fg-2">{t.requested}</td>
              <td className={`text-right ${t.inserted < t.requested ? 'text-warn' : 'text-ok-hover'}`} data-testid={`seed-inserted-${t.table}`}>
                {t.inserted}
              </td>
              <td className="text-right text-fg-3">{t.constraintViolations}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.warnings.map((w) => (
        <p key={w} className="text-[11px] text-warn">
          {w}
        </p>
      ))}
      <p className="text-[11px] text-fg-3">
        seed {report.randomSeed} · locale {report.locale} · generator v{report.generatorVersion}
      </p>
    </div>
  );
}

export function SchemaSummary() {
  const { state } = useWorkspace();
  const md = state.metadata;
  if (!md) return <p className="px-3 pb-3 text-xs text-fg-3">No database built yet.</p>;
  return (
    <div className="space-y-3 border-t border-line px-3 py-3" data-testid="schema-summary">
      <span className="panel-title">
        Discovered · {md.tables.length} tables · {md.relationships.length} relationships · {md.views.length} views
      </span>
      <ul className="space-y-1">
        {md.tables.map((t) => (
          <li key={t.name} className="flex flex-wrap items-center gap-x-2 font-mono text-[11px]" data-testid={`schema-summary-table-${t.name}`}>
            <span className="text-fg">{t.name}</span>
            <span className="text-fg-3">{t.columns.length} cols</span>
            {t.primaryKey.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-warn">
                <KeyRound size={10} /> {t.primaryKey.join(', ')}
              </span>
            )}
            {t.foreignKeys.map((fk) => (
              <span key={fk.id} className="inline-flex items-center gap-0.5 text-info">
                <Link size={10} /> {fk.mappings.map((m) => m.from).join(', ')} → {fk.toTable}
              </span>
            ))}
            <span className="ml-auto text-fg-2">{t.rowCount ?? '?'} rows</span>
            {!t.seedable && <span className="w-full font-sans text-warn">Not seeded automatically: {t.skipReason}</span>}
          </li>
        ))}
      </ul>
      {state.seedReport && <SeedReportView report={state.seedReport} />}
    </div>
  );
}
