---
name: activity-system
description: Architecture of the davesnider.com activity feed — two-level schema (activity + per-type detail tables), the three producer shapes (cron workers, webhooks, direct pushers), bearer-token ingest routes, FTS trigger migrations, the add-a-new-type checklist, R2 image handling, dev/verify workflow. Load when adding or changing an activity type, an ingest route, a worker, or anything under src/routes/activity or src/lib/components/ActivityItem.
---

# Activity feed architecture

> **Freshness**: last verified 2026-10-13 against Svelte 5.56, drizzle-orm 0.45, Turso/libSQL (manual-add producer + book type added).
> Anchor files are listed at the bottom — if one is missing or looks different, the code wins; update this skill (see "Keeping this skill current").
> Flight-specific depth lives in the `flight-activity` skill.

## Big picture

- Two-level schema in `src/db/schema.ts`: one generic `activity` row per event
  (`type` from `VALID_ACTIVITY_TYPES`, `externalId` dedupe key with a unique
  `(type, external_id)` index, `timestamp` unix seconds, `isPrivate` soft-hide,
  `isThreadRoot`/`threadLatestTimestamp` for Bluesky threading — non-threaded
  types set root=true and mirror the timestamp) + **one detail table per type**
  (`activity_bgg`, `activity_steam`, …) joined on `activity_id` with cascade
  delete. **There is no generic metadata JSON column** — each type gets real
  columns; structured blobs use `text(..., { mode: 'json' }).$type<T>()`.
  Detail tables may also carry **admin-curated columns** that ingest never
  writes (`activity_flight.trip` / `trip_stop`, `screenshot_url`), edited
  through cookie-auth PATCH/POST routes under `/api/activity/<type>/[id]/`.
- **Unmigrated columns don't crash — they lie.** SQLite resolves an unknown
  double-quoted identifier as a string literal, so a schema column that is
  missing in the DB selects as its own name (`trip` → `'trip'`). If new
  fields read back as their column names, the migration hasn't run.
- DB is Turso/libSQL. Prod runs an embedded replica at `/app/data/turso_local.db`
  (Fly volume; `DB_REPLICA_DIR` overrides the directory, so
  `ENV_NAME=production DB_REPLICA_DIR=/tmp/x pnpm vite dev` reproduces the
  prod read path locally); **dev connects to the remote prod database** — a
  dev-server ingest writes live data. Test items are cleaned up with the
  admin × (soft hide) or a real DELETE.
- **The replica self-heals** (`src/lib/server/db.ts` +
  `resilientClient.ts`, unit-tested with `pnpm test:unit`). drizzle gets a
  Proxy over the libsql client: a Hrana stream error (`stream not found`,
  `invalid baton` — primary restarted) → `reconnect()` + retry once; a
  replica error (`WAL frame insert conflict`, `SQLITE_CORRUPT`, `malformed`)
  → close, wipe the replica files, full re-sync (~1 s), retry once — and
  remote-only fallback if the re-sync itself fails. A 60 s watchdog calls
  `client.sync()` so a stuck sync loop (2026-09-11: WalConflict every 30 s,
  multi-row reads 500ing while single rows worked, invisible from JS) is
  rebuilt before a reader sees it. `/healthcheck` reports
  `database.{mode,lastSyncAt,lastSyncError,rebuilds,…}` without touching the
  DB; `/healthcheck/db` runs a real multi-row read through the resilient
  client (503 only when recovery failed; not wired into Fly checks).
  `FORCE_FRESH_SYNC=true` (Fly secret) still forces a wipe at boot.
- `hooks.server.ts` `handleError` logs the full `cause` chain
  (`errorMessages()` in `src/lib/server/errors.ts`) — drizzle's
  `Failed query` alone hides the libsql message underneath.
- Feed queries: `src/routes/activity/+page.server.ts` and
  `/api/activity/list` share `withActivityDetails()` from
  `src/lib/server/activity.ts`, which batch-fetches every detail table by
  `inArray(activityId)` — adding a type means editing **both switch statements
  and the Promise.all block** there.
- Search is a standalone FTS5 table `activity_fts(title, body)` with
  `rowid = activity.id`, kept in sync by per-detail-table AFTER
  INSERT/UPDATE/DELETE triggers (see Migrations).

## Producer shapes (pick one when adding a source)

- **Cron worker** (`workers/activity-*/index.ts` + `wrangler.toml`): fetches a
  third-party API on a cron trigger, POSTs `{ items, deletedIds? }` to
  `https://davesnider.com/api/activity/ingest/<type>` with
  `Authorization: Bearer ${ACTIVITY_INGEST_TOKEN}`. **Workers never touch the
  DB.** Each also exposes `fetch()` (same bearer) as a manual kick;
  `scripts/ingest-local.sh` + `pnpm worker:<type>` + `pnpm tunnel` for local
  runs. Deploys via `.github/workflows/workers-deploy.yml` (path-filtered —
  a new worker must be added to its paths AND jobs).
- **True webhook**: plex — `?token=` query param, multipart body
  (`src/routes/api/activity/webhook/plex/+server.ts`).
- **Manual add** (admin form, cookie auth, no worker): `/activity/add` renders
  `PlexAddForm` (OMDB title search via `api/activity/omdb/search`, or paste an
  IMDB id → `api/activity/omdb/lookup`; a series result opens a season/episode
  picker fed by `api/activity/omdb/season` → `api/activity/add/plex`)
  and `BookAddForm` (Open Library title/author search via
  `api/activity/openlibrary/search` → `api/activity/add/book`, with an optional
  cover-URL override). `src/lib/server/openlibrary.ts` is keyless; it sends a
  `User-Agent` and uses `?default=false` so missing covers 404 instead of
  returning a blank image. Search's `first_publish_year` is a minimum over
  edition dates (one bad edition drags it down); the form re-resolves the
  year from the work record's curated `first_publish_date` via
  `api/activity/openlibrary/work` and leaves it editable. Book `externalId` is `book_<workOLID>_<YYYY-MM-DD>`.
  Reviews/ratings for plex and book share
  `src/lib/components/ReviewForm/ReviewForm.svelte` (takes the PATCH
  `endpoint`), backed by `api/activity/<type>/[id]` PATCH routes.
- **Direct producer** (no worker — the producing machine is the source):
  bookmarks TUI writes libsql directly (`tui/`); the flight recorder POSTs to
  its ingest route from the sim PC. Prefer HTTP ingest over direct DB writes
  so validation and R2 side-loading stay server-side.
- Ingest routes upsert by `(type, externalId)`, insert activity + detail **in
  one transaction** (no orphaned activity rows), return
  `{ created, updated, skipped, deleted, errors }`. The BGG route is the
  canonical pattern (including R2 art side-loading and a GET for delta sync).

## Migrations discipline

- **Never run `pnpm db:generate` yourself** — Dave runs generate and migrate
  (CLAUDE.md rule). Edit `src/db/schema.ts`, then ask.
- A new plain column (e.g. `trip`) needs only the generated migration; a
  column that should be **searchable** also needs a new custom FTS trigger
  migration (below).
- FTS triggers are **hand-written** `--custom` migrations modeled on
  `src/drizzle/0026_activity-link-fts.sql` (three triggers + backfill).
  **The table migration must precede the trigger migration** — a custom
  generated before the table's ALTER/CREATE breaks fresh migrates
  (`drizzle-kit drop` removes a misordered one).
- drizzle-kit writes unformatted meta JSON: after every generate, run
  `pnpm prettier --write src/drizzle/meta/` or format-check fails.

## Adding a new activity type — checklist

1. `src/db/schema.ts`: add to `VALID_ACTIVITY_TYPES`; new `activity_<type>`
   table + Select/Insert types. Dave runs generate/migrate.
2. FTS custom migration (title + searchable body fields).
3. `src/lib/server/activity.ts`: id-bucketing switch, details-attach switch,
   `Promise.all` entry.
4. Ingest route `src/routes/api/activity/ingest/<type>/+server.ts` (copy BGG).
5. `src/lib/components/ActivityItem/ActivityItem<Type>.svelte` + barrel export
   in `index.ts`; icon in `ActivityItem.svelte` `getTypeIcon` (simpleicons
   slug) or an inline SVG branch (plex/link/flight style); label in
   `getTypeLabel`.
6. `src/routes/activity/+page.svelte`: `{:else if}` chain, `activityTypes`
   filter list, `typeLabel`.
7. `ActivityRail/palette.ts`: insert alphabetically in `RAIL_TYPE_ORDER` and
   **re-spread `RAIL_MONO_MIX` evenly 25→95**; `railShared.ts::typeNoun`.
8. `EXPOSED_ACTIVITY_TYPES` in `src/routes/api/activity/heatmap/+server.ts`.
9. Home page sidebar, if the type deserves a teaser: add a query + dedupe
   block in `src/lib/server/homepage.ts` and a `TeaserSection` in
   `src/routes/+page.svelte` (books, movies, shows, games, board games).

## Images

- `src/lib/server/r2.ts`: `uploadImageToR2WithHash(url, subfolder)` fetches a
  remote URL (returns `null` on a non-2xx fetch — never throws);
  `uploadBufferToR2WithHash(buffer, contentType, subfolder)` takes bytes. Both
  content-address by SHA-256 under `activity/<subfolder>/` (`plex`, `bgg`,
  `book`, …) and dedupe via HeadObject; public URLs at
  `https://files.davesnider.com/<key>`.
  Bucket name env: `CLOUDFLARE_R2_BUCKET_NAME` (bucket `davesnider`).
- `files.davesnider.com` sits behind Cloudflare cache — purge the path after
  overwriting an existing key.

## Dev / verify workflow

```bash
pnpm dev                    # Dave's server, port 5177 — don't kill it
pnpm vite dev --port 5199   # throwaway server for Playwright verification
pnpm tunnel                 # cloudflared → local.davesnider.com for worker tests
pnpm format-check && pnpm tsc && pnpm check && pnpm lint   # all four must pass
```

Verify UI changes with Playwright against 5199 (screenshot + DOM probes), not
by asking Dave to look first. Ingest test: curl the route with the bearer from
`.env`. Remember 5199 still writes the shared remote DB.

## Anchor files (freshness check)

- `src/db/schema.ts` — types, activity + detail tables
- `src/lib/server/activity.ts` — withActivityDetails, FTS query helpers
- `src/routes/api/activity/ingest/bgg/+server.ts` — canonical ingest pattern
- `src/routes/activity/+page.svelte` — feed render chain + filters
- `src/lib/components/ActivityItem/index.ts` — component barrel
- `src/lib/components/ActivityRail/palette.ts` — rail order + mono ramp
- `src/routes/api/activity/heatmap/+server.ts` — exposed types
- `src/lib/server/homepage.ts` — home page teaser queries
- `src/lib/server/r2.ts` — image uploads
- `src/lib/server/db.ts` + `resilientClient.ts` — replica boot, watchdog, self-heal

## Keeping this skill current

If this document contradicts the code, trust the code, then update this file
in the same PR. Changes to the schema shape, ingest contract, the add-a-type
checklist surface, or the migrations discipline must be reflected here (and
in `flight-activity` where it overlaps).
