# Find Petrol: First Real-Data Feature

Open `/en/app/stations` in the existing Driver account. Guests can also browse. Other supported locale prefixes work on the same route.

## What Works

- Optional browser GPS, or typed/selected City Centre, Susan Road or D Ground. This is a bounded pilot-area lookup, not a general address geocoder.
- Search coordinates travel in a POST body, not a URL. The app does not write search locations to accounts, browser storage or database records. Infrastructure request-body logging should remain disabled. Opening the map shares the viewed area with its tile service.
- PostGIS searches the spatially indexed station table within 15 km, expanding to 30 km only when no results are found. It sorts by geographic distance and returns at most 50 stations. Distances are straight-line estimates, not road routes.
- Fuel filters require a verified record, a valid past verification date and the matching fuel type. Unverified metadata is displayed as Unknown, not evidence of absence or stock. All shows real unverified leads with explicit labels; when the returned results have no verified records, a data-gap warning explains that names, pins and fuels need human checking. This is not a claim of exhaustive coverage.
- Map/list and direct-ID details use the same latest approved report lookup, excluding future observations, pending reports and demo records. Community, station and admin sources are separately labelled. Expired reports become Stale, including while a result remains open.
- Database/API errors show a retry state, never sample stations. The existing `/demo/` preview is separate.
- `/en/admin/stations` allows an administrator to correct the pin, public metadata and source. Verified status requires an explicit human-check confirmation and records a separate verification time and audit event. No existing record was automatically verified.
- Existing approved, assigned station staff retain their availability-update workflow and its expiry. Metadata corrections/verification remain with administrators.
- The Overpass importer now inserts new unverified leads and skips existing OSM records. It must not overwrite reviewed station data. Existing leads must be reviewed through the admin tool; this is not an automated data-refresh pipeline.

## Database Setup

Migration: `supabase/migrations/20261011170626_nearby_station_search.sql`. Applied to the already linked project during implementation and recorded in migration history. For another environment, review and apply this migration using the normal migration workflow.

Adds `stations.verified_at`, a security-invoker `nearby_stations` RPC, a bounded safe-field `station_latest_reports` RPC, and a guarded `admin_update_station_details` RPC. Reuses the existing PostGIS index, tables, roles and audit log. Search performs no writes. The old direct metadata-update RPC is no longer exposed to browser roles.

Spatial-query approach follows [Supabase's PostGIS guidance](https://supabase.com/docs/guides/database/extensions/postgis). No routing key or new paid service is needed for nearby distance sorting.

## Checks

Run `npm test`, `npm run lint` and `npm run build` at the repository root. `station-search.test.ts` covers manual/GPS validation; `availability.test.ts` includes exact and malformed expiry cases.

The follow-up migration `supabase/migrations/20261011180313_confirmed_station_fuel_filters.sql` was applied to the linked project on 11 October 2026 after explicit owner authorisation. It requires dated human verification before a fuel match, inside the indexed spatial query and before its 50-result limit. The API also rejects unverified fuel matches defensively.

Remote history lacks entries for seven older baseline migration files whose schema already exists. They were not rerun or marked applied without a separate baseline audit. A temporary migration directory containing only the recorded timestamped migrations and this new migration allowed a dry run to identify exactly one pending change; only that change was pushed. No seed data, roles or station records were modified. Read-only checks confirmed migration history, the dated predicate, security-invoker execution, anonymous/authenticated grants without PUBLIC execution, and public nearby RPC responses. The database still has 82 station records and zero dated verified non-demo records; the petrol filter returns zero matches. A post-push local catalog-cache warning due to missing Docker did not prevent the remote migration from being applied and verified.

The synthetic SQL tests remain unrun in this workspace. Use an isolated local/staging database with synthetic data, review/apply the migration there using the normal migration workflow, then run `supabase/tests/station_discovery.sql` and `supabase/tests/confirmed_station_fuels.sql` against that test database only. Fixtures roll back, but this is not permission to run write tests against live records. Check `EXPLAIN (ANALYZE, BUFFERS)` with a staging-sized dataset to confirm the existing geography index is useful. Local SQL execution requires a PostgreSQL/PostGIS test environment; Docker is not available in the current workspace.

Browser verification covers desktop and mobile, guest/Driver access, GPS permission granted/denied, manual search, filters, map failure fallback, details and restricted admin writes.

The repeatable read-only browser check is `node scripts/test-find-petrol.cjs` with the dev server running. It requires Playwright and installed Chromium; `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can point to an existing installation, and `TEST_BASE_URL` defaults to `http://localhost:3000`. Synthetic records are intercepted only in the test browser, never written to the database. The check compares real list/detail facts, then exercises denied GPS, manual search, confirmed/unknown fuel metadata and desktop/mobile widths.

## Still Needed Before a Real Pilot

- A person must check station pins, names, addresses and fuels. The current imported records are leads; the implementation did not change them or invent confirmations.
- Use `/en/admin/stations` with an individually authorised admin account: check the actual station entrance/name, obtain fuel evidence, correct coordinates/source, select only checked fuel types, choose Verified and confirm the human-check checkbox. Saving records the review time. Leave uncertain fuels empty and uncertain stations unverified; do not re-import to manufacture verification. An import/update timestamp is not a human check.
- MapLibre v6's worker now uses version-matched, same-origin assets prepared automatically before dev/build/start. The configured MapTiler style and real street-tile requests succeed from localhost after the worker fix. A server-side probe without Origin/Referer returned HTTP 403, while the localhost-origin probe returned HTTP 200; that originless denial did not establish that the browser key was invalid. No replacement provider, key restriction change or permission bypass was added. Production-host permissions and service entitlement still need owner review. Lists remain usable if tiles fail, and the fallback explicitly reports denied map access. WebGL2 support is required.
- Prices, road routing, TrueCost improvements, unrestricted geocoding, 3D maps, roadside dispatch and provider partnerships are outside this change.
- Rotate credentials previously shared in chat. Existing broader database advisor warnings and direct report-write/public-report policies still require the security review described in the main plan. This scoped implementation is not a full security audit or permission to launch an unsupervised pilot.
- New availability updates are fetched on search/retry; an existing displayed report expires locally. No background live-stock polling or stock guarantee is claimed.

## Map Worker Regression Check

`node scripts/test-map-worker.cjs` uses the same Playwright/Chromium environment variables as the finder browser check. It verifies the actual local worker assets and nonblank, interactive desktop/mobile canvases using a synthetic intercepted style, then tests HTTP 403/list fallback and recovery. The synthetic style is test-only and does not establish real street-tile access or physical station verification. Generated MapLibre assets are ignored by Git and ESLint; `scripts/prepare-map-worker.mjs` copies the installed distribution and its licence into a versioned public directory. Do not disable access restrictions or switch to a public demo map to mask a denied key.
