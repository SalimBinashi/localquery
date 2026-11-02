# Local-First SQLite Playground

A 100% client-side SQLite IDE. Define schemas, generate realistic relational mock data, run any SQL, inspect results and the ERD, and share reproducible workspaces through a URL — no account, backend, or paid service.

The app lives in `frontend/`. (The repository's `backend/` folder is an unused platform template; the playground never calls it.)

## Quick start

Prerequisites: Node.js 20+, Yarn 1.x (the committed lockfile is `frontend/yarn.lock`; `npm install` also works but will not use the lockfile).

```bash
cd frontend
yarn install          # dependencies (versions pinned by yarn.lock)
yarn dev              # dev server at http://localhost:5173
yarn typecheck        # tsc --noEmit (strict, noUncheckedIndexedAccess)
yarn lint             # ESLint (typescript-eslint, react-hooks, no-eval)
yarn test             # Vitest: unit + integration against real sql.js WASM
yarn build            # type-check + production build into frontend/build
yarn preview          # serve the production build
yarn test:e2e         # Playwright (builds must exist; starts `vite preview`)
```

Playwright uses its bundled Chromium (`npx playwright install chromium`) or any Chrome via `CHROME_PATH=/usr/bin/google-chrome yarn test:e2e`. Point it at a deployed site with `E2E_BASE_URL=https://you.github.io/repo/`.

## Architecture

```
React UI (main thread)                     Dedicated Web Worker
┌──────────────────────────────┐  typed   ┌───────────────────────────────┐
│ WorkspaceProvider (reducer)  │  request │ sqlite.worker.ts              │
│  editors, seed config,       │ ───────► │  SQLiteEngine (owns the only  │
│  results, history, notices   │ ◄─────── │  sql.js Database)             │
│ SQLiteWorkerClient           │ response │  schemaInspector (PRAGMAs)    │
│  request IDs, stale drop,    │ progress │  MockDataGenerator + planner  │
│  stall watchdog, restart     │          │  metadata, export/import      │
└──────────────────────────────┘          └───────────────────────────────┘
```

* **Engine choice:** `sql.js` 1.13 (SQLite 3.49.1, WASM). Self-contained, in-memory, mature, with `export()` and a prepared-statement iterator. CR-SQLite was not used: replication/CRDT features add complexity a single-user playground doesn't need.
* **Worker protocol** (`src/lib/sqlite/sqliteTypes.ts`): discriminated unions keyed by `INIT | APPLY_SCHEMA | SEED_DATABASE | INSERT_RECORDS | EXECUTE_QUERY | GET_SCHEMA_METADATA | RESET_DATABASE | EXPORT_DATABASE | EXPORT_SQL_DUMP | IMPORT_DATABASE | DISPOSE`; responses are `success | failure | progress`, each carrying the originating request id. Malformed messages are rejected; responses for unknown ids (terminated/superseded) are ignored. The provider also uses an operation generation counter so stale results never overwrite newer state.
* **Single source of truth:** the worker owns the live database. React holds only editor text, settings and serializable results/metadata.
* **WASM asset:** imported with `?url` and bundled locally — it resolves under any `base` path. No CDN.
* **Strict Mode:** the first worker created by the double-mounted effect is disposed; readiness is shown only after `INIT` succeeds.

## Schema application (rebuild policy)

Pressing **Interpret Schema & Generate Seed** (or Ctrl/Cmd+Enter in the schema editor):

1. Validates non-empty input (≤ 100k chars).
2. Creates a **staging database** (`PRAGMA foreign_keys = ON`) and executes the script statement-by-statement through sql.js' `iterateStatements` (trigger bodies, strings and comments are handled by SQLite itself).
3. Rejects scripts that leave a transaction open.
4. Inspects metadata from SQLite (`pragma_table_list`, `sqlite_schema`, `pragma_table_xinfo`, `pragma_foreign_key_list`, `pragma_index_list/index_info`).
5. Seeds inside a `SAVEPOINT`, validates with `PRAGMA foreign_key_check`, and rolls back on any failure.
6. Only if everything succeeded, swaps the staging DB in and closes the old one. **A failed rebuild leaves the previous database untouched.**

The editor never touches the DB until you apply. If the live DB has query/import changes, a confirmation explains they will be discarded.

## Mock data generation

* **Deterministic:** seeded Faker instance + fixed reference date (`2025-06-01`). Same schema + seed + locale + generator version ⇒ same data. The generator version is stored in share links; upgrades may change output.
* **Density:** 10 / 50 / 100 rows is a *target* per eligible table, capped by a 20,000-row global budget, 60 tables, 120 columns per table, 20 s timeout and bounded retries (8 attempts per row, 200 failed rows per table). Actual inserted counts are measured with `COUNT(*)` before/after.
* **Precedence:** relational role first (FK → parent values; `INTEGER PRIMARY KEY` → omitted so SQLite assigns it; generated/hidden columns → omitted) → CHECK `IN` list → semantic name rule compatible with the declared type (`email`, `first_name`, `created_at`, `price`, `status` per domain, `is_*`, `uuid`, `json/metadata`, `blob`…) → declared-type fallback. Columns with a `DEFAULT` and no semantic match are omitted so SQLite evaluates the default (defaults are never evaluated in JS).
* **Constraints:** UNIQUE/PK sets are tracked (including pre-existing rows); collisions retry and then get deterministic suffixes. CHECK hints understood: comparisons, `BETWEEN`, `IN`, `length()`, `<> ''`, and two-column comparisons (repaired by swapping). Anything else is left to SQLite, with bounded retries and the rejection messages reported.
* **Foreign keys:** a planner topologically orders tables (parents first) and draws FK values from the parent rows that actually exist (`SELECT DISTINCT …`). Composite FKs are one relationship with ordered mappings and are filled as tuples. Nullable self-references and nullable cycle edges are inserted as NULL and filled in a second `UPDATE` pass (self-references only point to earlier rows → acyclic hierarchies). NOT NULL cycles, NOT NULL references to missing tables, empty NOT NULL parents and virtual/shadow tables are skipped with explicit reasons. Foreign-key enforcement is never disabled.
* **Safety:** all generated inserts use prepared statements with bound parameters; identifiers are quoted with `quoteIdentifier`.

## Queries & results

* Every statement in the editor runs in order against the live DB; there is no `SELECT`-prefix detection — `returnsRows` comes from SQLite's column count. One result set per statement.
* On error, execution stops; earlier statements stay applied (autocommit) unless you are inside your own `BEGIN`; later ones are reported as skipped. Explicit transactions behave as in SQLite; the status bar warns when a transaction is left open.
* `changes` (sqlite3_changes) is reported only for INSERT/UPDATE/DELETE/REPLACE. Schema changes are detected via `PRAGMA schema_version` (metadata + ERD refresh), data changes via `total_changes()`.
* Display limits: 5,000 retained rows / 8 MB per statement, 100 visible columns, 200 chars per cell (click a cell for the full exact value + copy). The query always runs to completion and the true row count is shown; truncation is labelled. Pagination is client-side over retained rows; SQL is never rewritten.
* NULL, BLOB (byte length + hex preview) and 64-bit integers (exact text outside ±2^53) are rendered distinctly. CSV: NULL = empty field, empty string = `""`, BLOB = `\x…` hex.
* Metrics are labelled: SQLite execution (measured in the worker), round-trip (main thread), messaging + transfer (difference). Init, DDL, inspection and generation times are shown in **Execution**.
* Cancellation: SQLite in WASM cannot be interrupted mid-statement. After 15 s a banner offers **Terminate & rebuild**, which kills the worker (losing the in-memory DB, stated explicitly) and rebuilds the last applied schema.

## Workspace URL format

`#ws1.<lz-string compressToEncodedURIComponent(JSON)>` where JSON is

```ts
{ version: 1, generatorVersion: 1, schema, currentQuery,
  seedConfig: { enabled, rowsPerTable: 10|50|100, randomSeed: 0..2^32-1, locale: 'en'|'de'|'fr'|'es'|'pt_BR' },
  schemaOptions: { seedOnApply } }
```

* Written only by **Share** (`history.pushState`, no reload), then copied with the Clipboard API; success is shown only after the copy resolves, with a manual-copy field on failure.
* Opening a link **fills the editors only**; you click **Build database now** to rebuild schema + deterministic seed. The query is never auto-run. Back/Forward/manual hash edits restore editors the same way, never rebuilding automatically.
* Untrusted input: hashes > 16,000 chars are rejected before decompression; decoded JSON is capped at 220k chars and validated field by field (unknown fields dropped). Invalid links fall back to the default workspace with a warning.
* Size: links above 8,000 characters are refused (warning from 6,000). Nothing is truncated to fit and no shortener is used — export a SQL dump instead.
* Not included: data changed by queries or imports, and query history (session-only). The header shows “DB changes not in link” when that applies.

## Export / import

* **Share link** — schema + query + seed settings (reproducible rebuild).
* **SQL dump** — schema plus `INSERT`s for all current rows (virtual-table contents excluded).
* **Query CSV** — retained rows of the selected result.
* **.sqlite export** — byte-exact database file from `db.export()` (requires no open transaction; FK pragma is re-enabled after export).
* **Import** — ≤ 50 MB, SQLite header check, `PRAGMA quick_check`, staged before replacing the live DB. Imported data is marked as not reproducible from the link.

## Privacy & offline

No telemetry, analytics or remote logging. After the static assets load, everything runs offline in the tab. No service worker is shipped, so a reload while offline relies on the browser HTTP cache only. See the in-app **Privacy** dialog.

## Deploying for free (static hosting)

**GitHub Pages** (workflow included at `.github/workflows/deploy-pages.yml`): push to `main`, then in *Settings → Pages* choose *GitHub Actions*. The workflow type-checks, lints, tests and builds with `VITE_BASE_PATH=/<repo>/`, so the worker and WASM URLs resolve under the sub-path.

**Cloudflare Pages / Netlify:** build command `cd frontend && yarn install && yarn build`, output directory `frontend/build`, no env vars (use `VITE_BASE_PATH` only for sub-paths). `public/_headers` sets `application/wasm` for Cloudflare/Netlify.

No secrets, API routes or paid services are needed. Free tiers have their own quotas and terms.

## Supported SQL & known limitations

Supported and tested: CREATE/ALTER/DROP TABLE, views, indexes, triggers, INSERT/UPDATE/DELETE (incl. RETURNING), joins, GROUP BY/HAVING, CTEs incl. recursive, window functions, subqueries, transactions, composite PK/FK, UNIQUE, CHECK, NOT NULL, generated columns, STRICT/WITHOUT ROWID, JSON functions, FTS3.

Limitations: no FTS5/R*Tree/extensions; result declared types unavailable; statements cannot be interrupted; CHECK expressions beyond the forms above are enforced by SQLite but not targeted by the generator; NOT NULL foreign-key cycles are not auto-seeded; WITHOUT ROWID tables with deferred FKs are updated via their primary key; data is ephemeral unless exported.

## Troubleshooting

* **Status stays “Initializing” / “Error”:** the WASM file failed to load — check that `*.wasm` is served (MIME `application/wasm`) and `VITE_BASE_PATH` matches the deploy path; use **Retry initialization**.
* **Share says copy failed:** clipboard requires HTTPS or localhost and a user gesture; copy from the field shown.
* **Seed report shows fewer rows:** read the per-table reasons (unique domain exhausted, CHECK rejected values, global budget).

## Example SQL

```sql
CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  manager_id INTEGER REFERENCES employees(id),
  salary REAL CHECK (salary > 0),
  hired_at TEXT NOT NULL
);
-- then:
WITH RECURSIVE chain(id, full_name, depth) AS (
  SELECT id, full_name, 0 FROM employees WHERE manager_id IS NULL
  UNION ALL SELECT e.id, e.full_name, c.depth + 1 FROM employees e JOIN chain c ON e.manager_id = c.id
)
SELECT depth, COUNT(*) FROM chain GROUP BY depth;
```

## Main modules

`src/lib/sqlite` (engine, worker client, protocol, errors, metadata) · `src/workers/sqlite.worker.ts` · `src/lib/schema` (tokenizer, CREATE TABLE parser, inspector, identifiers) · `src/lib/seeding` (generator, faker mappings, CHECK hints, planner) · `src/lib/query` (splitter, classifier, formatter) · `src/lib/sharing` (codec, validation, URL state) · `src/components/*` (layout, schema, query, results, erd, sharing) · tests in `src/test` and `tests/e2e`.
