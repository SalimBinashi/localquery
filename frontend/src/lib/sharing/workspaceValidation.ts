import type { PlaygroundState, PlaygroundStateV1 } from '@/types/workspace';
import { SEED_DENSITIES, SUPPORTED_LOCALES } from '@/types/workspace';
import { URL_LIMITS } from '@/lib/limits';

export type ValidationResult = { readonly ok: true; readonly state: PlaygroundState } | { readonly ok: false; readonly reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function countCreateTables(schema: string): number {
  return (schema.match(/\bcreate\s+(?:temp\w*\s+)?table\b/gi) ?? []).length;
}

/** Validates untrusted (already JSON-parsed) workspace data. Unknown fields are dropped. */
export function validateWorkspace(input: unknown): ValidationResult {
  if (!isRecord(input)) return { ok: false, reason: 'Workspace payload is not an object.' };
  if (input.version !== 1) return { ok: false, reason: `Unsupported workspace version: ${String(input.version)}.` };
  const { schema, currentQuery, seedConfig, schemaOptions, generatorVersion } = input;
  if (typeof schema !== 'string') return { ok: false, reason: 'Missing or invalid "schema".' };
  if (typeof currentQuery !== 'string') return { ok: false, reason: 'Missing or invalid "currentQuery".' };
  if (schema.length > URL_LIMITS.maxSchemaChars) return { ok: false, reason: `Schema exceeds ${URL_LIMITS.maxSchemaChars} characters.` };
  if (currentQuery.length > URL_LIMITS.maxQueryChars) return { ok: false, reason: `Query exceeds ${URL_LIMITS.maxQueryChars} characters.` };
  if (countCreateTables(schema) > URL_LIMITS.maxTables) return { ok: false, reason: `Schema declares more than ${URL_LIMITS.maxTables} tables.` };
  if (!isRecord(seedConfig)) return { ok: false, reason: 'Missing "seedConfig".' };
  const { enabled, rowsPerTable, randomSeed, locale } = seedConfig;
  if (typeof enabled !== 'boolean') return { ok: false, reason: 'seedConfig.enabled must be a boolean.' };
  if (!SEED_DENSITIES.includes(rowsPerTable as (typeof SEED_DENSITIES)[number])) return { ok: false, reason: 'seedConfig.rowsPerTable must be 10, 50 or 100.' };
  if (typeof randomSeed !== 'number' || !Number.isSafeInteger(randomSeed) || randomSeed < 0 || randomSeed > 2 ** 32 - 1) return { ok: false, reason: 'seedConfig.randomSeed must be an integer between 0 and 4294967295.' };
  if (!SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number])) return { ok: false, reason: `Unsupported locale "${String(locale)}".` };
  const seedOnApply = isRecord(schemaOptions) && typeof schemaOptions.seedOnApply === 'boolean' ? schemaOptions.seedOnApply : true;
  const state: PlaygroundStateV1 = {
    version: 1,
    generatorVersion: typeof generatorVersion === 'number' && Number.isInteger(generatorVersion) ? generatorVersion : 1,
    schema,
    currentQuery,
    seedConfig: { enabled, rowsPerTable: rowsPerTable as PlaygroundStateV1['seedConfig']['rowsPerTable'], randomSeed, locale: locale as PlaygroundStateV1['seedConfig']['locale'] },
    schemaOptions: { seedOnApply },
  };
  return { ok: true, state };
}
