export const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'es', 'pt_BR'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const SEED_DENSITIES = [10, 50, 100] as const;
export type SeedDensity = (typeof SEED_DENSITIES)[number];

export interface SeedConfig {
  readonly enabled: boolean;
  readonly rowsPerTable: SeedDensity;
  readonly randomSeed: number;
  readonly locale: SupportedLocale;
}

/** Versioned, serializable workspace contract carried in the URL hash. */
export interface PlaygroundStateV1 {
  readonly version: 1;
  readonly generatorVersion: number;
  readonly schema: string;
  readonly currentQuery: string;
  readonly seedConfig: SeedConfig;
  readonly schemaOptions: {
    readonly seedOnApply: boolean;
  };
}

export type PlaygroundState = PlaygroundStateV1;
