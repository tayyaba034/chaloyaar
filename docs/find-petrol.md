# Find Petrol: First Real-Data Feature

Open `/en/app/stations` in the existing Driver account. Guests can also browse. Other supported locale prefixes work on the same route.

## What Works

- Optional browser GPS, or typed/selected City Centre, Susan Road or D Ground. This is a bounded pilot-area lookup, not a general address geocoder.
- Search coordinates travel in a POST body, not a URL. The app does not write search locations to accounts, browser storage or database records. Infrastructure request-body logging should remain disabled. Opening the map shares the viewed area with its tile service.
- PostGIS searches the spatially indexed station table within 15 km, expanding to 30 km only when no results are found. It sorts by geographic distance and returns at most 50 stations. Distances are straight-line estimates, not road routes.
- Fuel filters require a recorded fuel type. Missing fuel metadata is Unknown, not evidence of absence or stock.
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

Run `supabase db query --linked --file supabase/tests/station_discovery.sql` only against the intended test project. Temporary fixtures test more than 100 records, nearest sorting, radius, filters, stale evidence, approval/future exclusions, verification permissions and audit writes; the transaction rolls back all fixtures.

Browser verification covers desktop and mobile, guest/Driver access, GPS permission granted/denied, manual search, filters, map failure fallback, details and restricted admin writes.

## Still Needed Before a Real Pilot

- A person must check station pins, names, addresses and fuels. The current imported records are leads; the implementation did not change them or invent confirmations.
- The supplied map configuration currently falls back instead of rendering tiles. The account owner must confirm a valid restricted MapTiler key, entitlement and allowed hosts; browser/WebGL/worker failures also need checking on target devices. Lists do not require tiles.
- Prices, road routing, TrueCost improvements, unrestricted geocoding, 3D maps, roadside dispatch and provider partnerships are outside this change.
- Rotate credentials previously shared in chat. Existing broader database advisor warnings and direct report-write/public-report policies still require the security review described in the main plan. This scoped implementation is not a full security audit or permission to launch an unsupervised pilot.
- New availability updates are fetched on search/retry; an existing displayed report expires locally. No background live-stock polling or stock guarantee is claimed.
