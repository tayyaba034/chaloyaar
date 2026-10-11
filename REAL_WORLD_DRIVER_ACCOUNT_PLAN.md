# Chalo Yaar: Real-World Driver Account Plan

Review date: 11 October 2026. Repository baseline: `ac16939` on `main`.

This is a plan, not permission to implement, migrate, deploy, purchase services, or contact participants. This review inspected the code, read the final section of `Chaloyaarmvp.docx`, ran the existing unit tests, and used read-only database queries. No application code or database records were changed for this plan.

## Product Direction

Follow **FINAL CONSOLIDATED MVP: 3D GEOSPATIAL + REAL-WORLD PILOT** in `Chaloyaarmvp.docx`, not the earlier milestone descriptions. The final product combines station discovery, road-route detour estimates, clear report freshness, roadside-provider matching, and a practical CesiumJS 3D view with a usable 2D fallback.

Keep Next.js and the existing Supabase backend. Do not rewrite the app, add FastAPI just because the document allows it, build a native app first, or train an AI model. A useful, verified station list is more important than a large unverified dataset. The required small-area 3D experience must be planned and tested; it is not already implemented. Hosted 3D buildings and detailed terrain are optional data purchases, not assumed requirements.

Use three separate labels throughout the work:

- **Prototype:** sample workflows, developer tests, or clearly labelled demo data. No real dispatch.
- **Supervised pilot:** real participants in a named area and time window, with verified records, consent, operators, and support. Enable only features whose readiness gates pass.
- **Broader launch:** repeatable operations, reviewed permissions, reliable integrations, monitoring, support, and demonstrated pilot results.

An early 2D-only usability session can test data and workflow readiness. Do not describe it as delivery of the document's complete final MVP. The final MVP pilot also needs the scoped Cesium experience and its 2D fallback.

## 1. Current State

### 1.1 What Exists

Paths below use `/en` as an example. The app also supports Urdu, Roman Urdu, and Punjabi Shahmukhi prefixes.

| Area | Existing route and implementation | Actual status |
| --- | --- | --- |
| Driver Home | `/en/app`; `driver-dashboard.tsx` | Working authenticated summary of the saved name, own vehicles, fuel logs, requests, and a station near a fixed city-centre origin. That origin is not the Driver's current location. |
| Navigation | `driver-app-shell.tsx`; Driver layout and `driver.css` | Seven navigation items, responsive mobile menu, language control, speaker, request-update bell, and profile menu. Settings is in the profile menu, not the account entry page. |
| Sign-up/sign-in | `/en/auth/sign-up`, `/en/auth/sign-in`, `/en/auth/continue`; `auth-form.tsx` | Email/phone OTP flows are coded. Sign-in also supports email/password. Public password sign-up and password recovery are not complete workflows. Delivery depends on Supabase configuration and an email/SMS service. A seeded account login is not proof that new users can register. |
| Profile/settings | `/en/app/profile`, `/en/app/settings`; `driver-profile.tsx` | Saved name and account preferences persist. Email and phone are read-only Auth details. No full account export/deletion workflow. |
| Vehicles | `/en/app/vehicle`; `driver-vehicles.tsx` | Own vehicle add/edit/delete, fuel type, nickname, vehicle type, optional estimated economy, and deletion confirmation. Fuel records survive vehicle deletion. |
| Find Petrol | `/en/app/stations`; `station-discovery.tsx`, `station-map.tsx`, `truecost-map.tsx` | GPS or three manual pilot areas, loaded-record name/street search, fuel filters, map/list controls, source/time text, and map failure fallback. Nearby fetching can try 15 km then 30 km. This is not unrestricted place search. |
| Station details/reports | `/en/app/stations/[id]` and `/report` | Public details and authenticated report submission exist. The detail screen currently displays Unknown status/price instead of loading the live facts used by the list. It searches a capped station collection, not a direct ID query. |
| Save Money | `/en/app/truecost`; `truecost-feature.tsx`, `/api/truecost` | Real server calculation code, saved/manual economy, planned quantity, road-route adapter, cost breakdown, and personal-assumptions calculator. Needs supported fuel metadata and a database price. Candidates are six stations near the origin, not all stations along the trip. Verified discounts are not implemented. |
| Fuel History | `/en/app/fuel-history`, `/en/app/vehicle/log`; `driver-fuel-history.tsx` | Own dated records, vehicle/month filters, spending totals, mileage estimate, and delete confirmation. Latest 200 records are loaded; this is not a complete unlimited ledger. No fuel-record edit workflow. |
| Get Help | `/en/app/help`, `/en/app/help/[id]`; `roadside-assistance.tsx` | Service, pickup, vehicle, notes, quote lookup, review/confirmation, contact phone, own history, and cancellation exist. Request detail refreshes about every 15 seconds. No verified quote means no submission. The local sample walkthrough sends no request. |
| Quotes | `/api/requests/quotes`; `driver_service_quotes` | Trusted-quote storage and validation exist. No app flow creates a quote or obtains one from a provider. Current matching uses pickup-coordinate tolerance, not provider service-area coverage. |
| Provider tools | `/en/provider`, `/en/provider/services` | Approved providers can accept/decline and progress eligible requests; service categories and online/offline settings persist. Provider `/requests` and `/profile` are placeholders. No proper coverage editor, onboarding, quote-writing flow, or contact handoff. |
| Station operator tools | `/en/station-admin` | Approved staff can update fuel availability for assigned stations. Updates expire after two hours. Assignment and approval still need an admin operation outside a complete app workflow. |
| Admin tools | `/en/admin`, `/fuel-prices`, `/stations`, `/reports` | Overview, sourced reference-price entry, station metadata review, availability entry, and report moderation work. `/providers`, `/requests`, `/coverage`, and `/audit` still render `FeaturePlaceholder`. A complaints count is not a complaint-handling tool. |
| Preview | `/en/demo/...`; demo components and browser storage | Separate sample dashboard/profile. It is not the authenticated Driver backend. Keep it isolated from pilot accounts and measurements. |

All component names in this table are under `apps/web/src/components/`. Driver routes are under `apps/web/src/app/[locale]/app/`. There are no remaining main Driver pages that simply render `FeaturePlaceholder`, but real-world dependencies still block several useful outcomes.

### 1.2 Technical Inventory

- **Frontend:** npm workspace `apps/web`; Next.js App Router, TypeScript, React, next-intl, Tailwind tooling, shared CSS, Fontsource fonts, and Phosphor icons. `apps/web/package.json` declares Next.js `16.4.0` and React `19.3.0`; the lockfile records installed dependencies.
- **Backend:** Next.js route handlers under `apps/web/src/app/api/`, plus database functions and triggers. No separate deployed FastAPI service was found.
- **Database:** Supabase PostgreSQL. PostGIS already exists, and `stations.location` is a geographic point with a spatial index. Nearby APIs currently calculate distances in JavaScript after fetching capped station lists, rather than making full use of that index.
- **Authentication:** Supabase Auth with cookie-based SSR. `proxy.ts`, role layouts, `lib/role-access.ts`, `lib/role-guards.ts`, and `lib/api-auth.ts` check identity/role. Roles come from database `profiles`, not a client-selected role. RLS means database rules limit which rows each account may read or change.
- **Tables:** stations, profiles, driver vehicles, fuel prices, availability reports, providers, station-admin records/assignments, service requests, quotes, provider declines, fuel logs, complaints, service prices, and an admin audit log. No `request_events` or route-estimate cache table was found.
- **Maps/routing:** MapLibre 2D, a MapTiler public tile key, optional configured OSRM, and server-only OpenRouteService. Cesium is not installed. No general geocoder or terrain/building-data pipeline is connected.
- **Prices:** database reference prices and a request-time OGRA publication/PDF parser. These are separate paths: nearby search can try the parser, while TrueCost reads the database. The parser is not a contracted official price API or a dependable scheduled update system.
- **Speech:** browser voice fallback is implemented. `/api/tts` deliberately returns a not-configured response; fixed phrase recordings are not populated. Do not promise Urdu speech on every phone.
- **Notifications:** the bell reads request statuses and refreshes while open. No durable unread/read records, email delivery, push subscription, or SMS request-update integration.
- **Offline:** `public/sw.js` caches shell assets/offline pages and bypasses `/api/`. It does not provide reliable offline station facts or submit queued roadside requests.
- **Hosting:** local Next.js preview is established. No checked-in deployment pipeline, confirmed production URL, hosting account/plan, backup policy, or monitoring setup was found. Hosting may exist outside the repo; the owner must confirm it.
- **Tests:** this review reran 49 passing Vitest tests in seven files for mileage/validation, routing, TrueCost, roles, availability, messages, and voice. `npm test`, `npm run lint`, and `npm run build` exist. Previous work recorded passing lint/build and browser checks. There is no checked-in browser-test suite or CI workflow. `supabase/tests/driver_account_access.sql` checks ownership and quote/provider transitions using temporary fixtures; it was inspected, not executed in this planning review.

### 1.3 Read-Only Database Snapshot

The linked project's snapshot at this review contained:

| Item | Count |
| --- | ---: |
| Station records | 82 |
| Verified, non-demo stations | 0 |
| Stations with any fuel-type metadata | 0 |
| Non-demo fuel-price rows | 0 |
| Approved non-demo providers | 0 |
| Current approved non-demo availability reports | 0 |
| Unexpired service quotes | 0 |

PostGIS and the three Driver migrations were confirmed in the linked database. Counts can change and do not measure physical station stock or the existence of providers in Faisalabad. An imported, non-demo row is still not a field-verified station.

**Immediate consequence:** fuel filters and report submission need fuel metadata; TrueCost also needs a price row; real roadside help needs verified providers and quotes. More UI alone will not unblock these features.

### 1.4 Important Gaps and Risks

- `README.md`, `PLAN.md`, and parts of `docs/MOBILE-READINESS.md` describe older milestones. Use current code and the final document section for planning; update those files during implementation.
- Demo fallback behaviour needs repair/testing. In `/api/stations/nearby`, the empty-database path assigns demo stations and then filters demo stations out. The error path returns labelled demo rows, but their detail links may not resolve against the real database.
- Station imports can overwrite manual verification/fuel corrections when rerun. Preserve reviewed fields and keep import-source history before scheduling imports.
- Current price selection has no validity end/approval model. A latest old row can look usable indefinitely, and reference pricing can be mistaken for a specific pump price.
- Existing approved-report rows are directly selectable publicly and include reporter identifiers. Public facts should be a safe projection without personal identifiers.
- API moderation rules alone are insufficient: direct authenticated database inserts must also prevent a community user choosing a station/admin source or an unreasonable expiry.
- Provider access to legacy unassigned requests is based on role/service eligibility, not geography. Those records can include precise pickup coordinates. Review visibility before onboarding real providers; old unquoted requests must not become new live dispatches.
- The existing quote trigger validates expiry, provider approval, and matching pickup, but has no service-area check, recorded consent version, or detailed quote terms.
- Some schema operations use privileged database functions. Audit their caller checks, permissions, and logging; the presence of RLS alone is not a complete security review.
- No production-secret health, email/SMS deliverability, routing quality, partner eligibility, or production hosting claim was verified by this review. Credentials previously shared in chat need rotation before a pilot; never copy them into this document or source code.

## 2. Real Driver Account Features

Each feature needs both software and a person responsible for its real-world data. The development paths in this section are relative to `apps/web/src/` unless stated otherwise.

### 2.1 Sign-Up, Sign-In, and Profile

**Driver result:** browse stations without an account; register with a controlled email flow; sign in, sign out, save a name, and return to Home. Support account recovery and a clear deletion/support request. Add phone OTP only after delivery and consent are tested on the intended networks.

**Data:** authenticated user ID, verified email/phone when used, saved name, language, preferences, consent version/time, and account status. Do not require CNIC, date of birth, home address, or full travel history for an ordinary Driver account.

**Backend/API work:** finish `components/auth-form.tsx` and `app/[locale]/auth/continue/page.tsx`; add name onboarding after verified sign-up. Reuse `app/api/driver/profile/route.ts`. If passwords are offered publicly, build password creation and recovery together; otherwise make email OTP the pilot's clear primary flow. Configure production redirect URLs and email delivery. Add consent/export/deletion records and narrowly authorised endpoints; do not let user metadata assign privileged roles.

**Verify:** a genuinely new inbox registers, the profile trigger creates a Driver, Home opens rather than Settings, expired/reused codes fail, logout works, and account A cannot read/edit account B. Test recovery and session expiry. Confirm consent and deletion behaviour, including what happens to existing requests and backups.

### 2.2 Vehicle Profiles

**Driver result:** maintain a car or motorcycle and choose it when recording fuel, comparing detours, or asking for help. Distinguish entered economy from recorded mileage.

**Data:** the current `driver_vehicles` fields are sufficient for a petrol/diesel pilot. A default vehicle is optional. Do not add number plates or identity documents without a demonstrated need.

**Backend/API work:** retain `components/driver-vehicles.tsx`, `app/api/driver/vehicles/route.ts`, and `lib/driver-records.ts`. Test deletion with linked records and concurrent edits. Add a default-vehicle field only if users need it. Decide fuel/economy units before offering CNG cost or mileage calculations.

**Verify:** add/edit/reload/delete; invalid economy and unsupported types fail; deletion requires confirmation and preserves fuel history. Direct database access cannot attach another Driver's vehicle to a log or request.

### 2.3 Find Petrol

**Driver result:** use location only after consent, or choose an area/place manually; view sourced station facts in map/list; filter on confirmed fuel types; open consistent details; understand source and freshness.

**Data:** reviewed station pin, name, brand if known, fuel types, public address, verified opening details if available, source URL, last verification, and current/stale reports. A place pin alone does not prove fuel availability.

**Backend/API work:** improve `app/api/stations/nearby/route.ts`, `lib/stations.ts`, `components/station-discovery.tsx`, and the station detail page. Add a direct-ID safe detail endpoint and a PostGIS nearby query. Return unknown fuel metadata explicitly rather than implying absence. If adding geocoding, use a separately approved adapter; keep manual pilot areas as fallback. Fix demo boundaries, caps, duplicate handling, and opening-detail exposure.

**Verify:** field-check pilot pins and fuels; compare GPS/manual origin results; test all fuel filters, denied GPS, no metadata, no results, more than 100 stations, broken tile access, and detail/list agreement. A demo link must never imply a real station confirmation.

### 2.4 Route-Aware Comparison and TrueCost

**Driver result:** enter/select a destination, see a real road route when available, and compare suitable stations near that trip with an explanation of each estimate.

**Data:** temporary origin/destination, fuel quantity and unit, saved/manual economy, eligible station locations, priced reference or verified station price with effective/expiry dates, road routes, and any genuinely redeemable offer.

**Backend/API work:** extend `app/api/truecost/route.ts`, `lib/routing.ts`, `lib/truecost.ts`, and `components/truecost-feature.tsx`. Use a PostGIS corridor around the route, not only the nearest six origin-area stations. Calculate both direct and via-station routes with compatible providers/settings. Show per-station geometry, reference-price limitations, ranking reason, and calculation time. Keep eligible discount at zero until server-validated offer/redemption work exists. Reuse this endpoint rather than create a second independent formula just to match the document's example `/api/routes/fuel-options` name.

**Calculation:** `quantity x price + (extra road km / economy) x price - eligible discount`. Use consistent units, explicit rounding, and actual eligibility. Without economy, show purchase cost only. Without a verified/reference price, do not invent a station total; the existing personal-figures calculator remains clearly separate.

**Verify:** unit fixtures for identical/longer routes, rounding, missing economy/price, zero discounts, and mixed provider failures; reject client-forged prices/offers. Manually compare a small set of Faisalabad routes with field feedback. Approximate fallback must not claim a road detour, guaranteed saving, safe route, or ETA.

### 2.5 Fuel Logs and History

**Driver result:** add and correct dated fuel records, filter history, and see spending and mileage only for enough comparable data.

**Data:** existing own vehicle/station links, date/time, quantity, paid amount, optional odometer, and units. Consider a full-tank/comparable-refill flag before making mileage more prominent.

**Backend/API work:** extend `app/api/fuel-logs/route.ts`, `app/api/fuel-logs/[id]/route.ts`, `components/driver-fuel-history.tsx`, `lib/driver-records.ts`, and the Home summary API. Add authorised editing, pagination, and server totals for the requested period. Validate backdated odometers on both sides, define same-time record ordering, and handle duplicate submissions. Do not calculate account lifetime totals from a 200-row page.

**Verify:** different vehicles never mix odometers; the first refill is excluded from its following measured interval; partial refills, missing readings, edited dates, deleted vehicles, month boundaries in Pakistan time, and more than 200 records behave honestly. Reject non-finite/negative inputs and another account's IDs.

### 2.6 Roadside Service Requests

**Driver result:** ask for puncture/tyre help, battery jump-start, or towing inside the pilot boundary and operating window. Confirm the pickup pin and know when no eligible provider is available.

**Data:** minimal service, pickup, vehicle information needed by that provider, notes, appropriate contact detail, consent to sharing, provider eligibility, and service-area match. No fuel delivery in this pilot.

**Backend/API work:** `components/roadside-assistance.tsx` currently looks up already-existing quotes. Add an owned inquiry/draft flow so a legitimate quote can be requested before a dispatch exists. Suggested new table: `service_inquiries`; name it during implementation after reviewing the quote contract. Add nearby-provider/coverage lookup with a safe public provider projection. Staff can broker a pilot quote, but must use an audited authenticated tool, not raw SQL or a shared superuser login.

**Verify:** denied GPS still permits a reviewed manual pickup; outside-area/offline/suspended/wrong-service providers are excluded; no provider creates no dispatch. Retry/double-click creates at most one inquiry/request. Separate real mode from the current local sample walkthrough.

### 2.7 Quotes, Confirmation, Status, and History

**Driver result:** receive a quote identifying the actual provider, scope, price/currency, expiry, possible exclusions, and cancellation terms; confirm it explicitly; see a reliable event history through requested, accepted, en route, completed, or cancelled.

**Data:** extend `driver_service_quotes` with clear terms/version and inquiry linkage. Add `request_events` with server actor/time and safe message. Use existing `service_requests`; the database's `confirmed` status can still display as Accepted.

**Backend/API work:** add controlled operator/provider quote creation, provider display details, and approval/coverage validation. Recheck quote expiry and provider status atomically at confirmation. Store accepted terms and consent, derive amount/provider on the server, and use idempotency to avoid duplicate dispatch. Preserve the existing request-cancellation and provider-transition RPCs while adding events and audit records. Decide timeout, decline, quote revision, cancellation, completion dispute, and later payment policies before implementing them.

**Verify:** expired/foreign/reused quotes fail; quote price cannot be edited by a Driver; a changed quote requires fresh confirmation; two providers cannot accept one request; forbidden status jumps fail. A Driver cannot mark work complete by submitting a status field. Test retries, suspension after quoting, cancellation races, disconnected phones, and recorded complaints. Store real observed times, never promised arrival times.

### 2.8 Notifications and Settings

**Driver result:** get a visible confirmation and status updates while the app is open, see missed events on return, manage language/read-aloud preferences, and opt into any later message channel separately.

**Data:** owned request events plus notification read state/preferences. Email/SMS/push consent is distinct from the existing in-app toggle.

**Backend/API work:** extend `driver-app-shell.tsx`, `driver-profile.tsx`, `app/api/driver/profile/route.ts`, and `app/actions.ts`. Add event-based unread/read handling and reconnect fetching. Start with reliable polling; consider Supabase Realtime only after its table policies/reconnect behaviour are tested. Complete and human-review `messages/*.json` and `docs/translation-review.md`; several newer labels are English-only. Keep `app/api/tts/route.ts` honest unless a reviewed speech service is connected.

**Verify:** language choice survives sign-in/reload; settings save immediately and persist; updates are private and not lost after reconnect; read state is correct; unsupported voice has a useful explanation. No promise of background delivery from an in-app-only bell.

### 2.9 Admin, Station Staff, and Provider Support

**Operator result:** approve genuine providers/station staff, assign stations, maintain pins/prices, review reports/corrections, broker quotes, handle complaints, and identify data/coverage gaps.

**Data:** provider evidence/contact and review dates in restricted storage; service-area geometry/radius; current working availability; station assignments; price provenance; moderation reasons; disputes; audit events. Public provider identity must be agreed by the provider, not scraped private contact information.

**Backend/API work:** replace the relevant placeholders in `app/[locale]/admin/[...segments]/page.tsx` and `app/[locale]/provider/[...segments]/page.tsx`. Extend existing `app/api/admin/`, `app/api/dashboard/provider/`, and `app/api/station-admin/` handlers. Add approval/suspension and assignment APIs, a safe complaint workflow, provider coverage editing, and an admin-only coverage summary. Reference `service_prices` are not provider-specific binding quotes. Preserve existing working role workflows and add tests when shared permissions change.

**Verify:** pending/suspended providers cannot go online, quote, or accept; station staff can change assigned stations only; admin actions have a reason/actor/time; appeal and complaint resolution can be recorded. Coverage maps show data gaps, not inferred shortages. Existing audit writes cover some station changes, not every critical workflow.

## 3. Implementation Roadmap

The sequence below is for future implementation. Each phase should be a small set of reviewed tickets and migrations, not one large rewrite. Migration names are descriptions, not filenames to create now. Test migrations against a separate staging database; do not rerun old migrations blindly against the linked project.

Assign a product owner, developer, local pilot/data operator, and security reviewer. One person can hold more than one role, but responsibilities must be explicit. Dates depend on developer capacity, service access, field visits, and willing providers. The document's seven-day schedule is suitable for a demonstration/initial research, not a promise of production readiness.

### Phase 0: Agree the Boundary and Secure the Baseline

- **Code areas:** later update root `README.md`, `PLAN.md`, `docs/driver-account.md`, `docs/MOBILE-READINESS.md`, `.env.example`, and `apps/web/src/lib/{supabase-config,supabase-server,api-auth,role-access}.ts`. Add a checked-in browser-test setup and `.github/workflows/` checks.
- **Database/migrations:** inspect current schema/grants/history and backups. Only propose corrective security migrations after review. Do not seed demo users in a live environment.
- **User result:** a clearly named test environment and trustworthy sign-in entry, with explicit prototype labels and real pilot features switched off until approved.
- **Dependencies:** owner confirms pilot area/hours, hosting account, Supabase project ownership/region/plan, secret rotation, support contact, and what constitutes a real request.
- **Done/tests:** rotate previously exposed credentials; confirm public versus server secrets; baseline unit/lint/build checks pass; test new-account registration, two-account isolation, other-role redirects, and direct database access in staging. Review legacy requests before enabling providers. No unresolved high-risk access issue is accepted for a live pilot.

### Phase 1: Verify Stations and Establish One Price Source of Truth

- **Code areas:** `scripts/import-overpass.mjs`; station nearby/detail handlers and `lib/stations.ts`; `components/admin-stations.tsx`, `admin-fuel-prices.tsx`, `station-discovery.tsx`; the existing station detail page. Add coordinate correction and direct-ID fetching, not another unrelated station store.
- **Database/migrations:** station verification/source history and a reviewed nearby PostGIS function; safe public detail view; optional verified opening details. Extend `fuel_prices` for reference versus station-specific scope, validity end, review status, and source/checked time. Add separate station identity/source handling if imports need it.
- **User result:** 15-30 checked pilot stations where feasible, meaningful petrol/diesel filters, consistent details, and dated reference prices or an explicit Unknown state.
- **Dependencies:** field operator obtains station details and permission for non-public information; admin checks a current official publication and its meaning. Decide refresh ownership and price expiry rules.
- **Done/tests:** inspect every included pilot pin/fuel type; fix duplicates; imports preserve approved edits; map failure still allows search/list; empty/error/demo paths are labelled correctly; verify date/units and changed/unreadable price publications. No unsourced opening hours or live-stock claim.

### Phase 2: Finish Real Accounts and Reliable Personal History

- **Code areas:** `auth-form.tsx`, auth continuation, Driver profile/vehicles/history components, `app/api/driver/`, `app/api/fuel-logs/`, and `app/api/dashboard/driver/route.ts`.
- **Database/migrations:** consent records, supported account deletion/export rules, optional comparable-refill flag/default vehicle, and log-edit audit fields if needed. Reuse the existing owner-protected tables.
- **User result:** participants can register with their own inbox, save a vehicle, correct fuel records, and see accurate period totals.
- **Dependencies:** tested SMTP/redirect setup; decision on OTP versus complete password onboarding; approved retention policy and economy units. Petrol/diesel first; CNG monetary/mileage work waits for verified units and data.
- **Done/tests:** new sign-up, recovery if offered, expired session, logout, repeat visits, invalid data, backdated edits, timezone boundaries, pagination, delete confirmations, and Driver A/B isolation pass. Get at least three adults to try these tasks while parked before increasing recruitment.

### Phase 3: Ship Road-Route Comparison on Verified Inputs

- **Code areas:** `lib/routing.ts`, `lib/truecost.ts`, `/api/truecost`, `truecost-feature.tsx`, `truecost-map.tsx`, and a bounded destination-search/pin-selection adapter if approved.
- **Database/migrations:** route-corridor PostGIS query; optionally a short-lived route cache with documented privacy/expiry. Do not create an offer system just to show a discount; zero is acceptable until real redemption exists.
- **User result:** two or more suitable stations can be compared along a trip, with added road distance, source/date, assumptions, and an explanation of ranking.
- **Dependencies:** the selected routing operator confirms credentials, Faisalabad route quality, service terms, usage limits, caching rights, and costs. A self-hosted OSRM option also needs machine ownership, a bounded road extract, and update operations.
- **Done/tests:** deterministic cost fixtures pass; a field-tested route set works; no-road and provider-failure cases remain useful and explicit; API limits/timeout handling work; stale prices do not produce apparently current totals. Monitor calls per comparison: the current design can make a base route plus several via-station calls.

### Phase 4: Make Availability and Corrections Trustworthy

- **Code areas:** `lib/availability.ts`, `lib/stations.ts`, `station-report-form.tsx`, `station-report-moderation.tsx`, `station-admin-dashboard.tsx`, report/admin/station-admin APIs, and station details.
- **Database/migrations:** safe public report projection; source/expiry constraints and controlled report submission; persistent rate-limit/duplicate protections; moderation/correction reasons and audit events. Add station correction submissions if required.
- **User result:** station-confirmed, community-reported, stale, unavailable, queue, and unknown facts are distinguishable with real observation and review times.
- **Dependencies:** station staff agree to a practical confirmation window; operator handles moderation and disputes; team decides per-source expiry and conflicting-report policy. Existing two-hour expiry is a starting setting, not proven stock accuracy.
- **Done/tests:** fake station/admin sources, excessive expiries, bursts, duplicates, old approvals, and rejected reports do not become fresh confirmation. Test expiry automatically and list/detail consistency. Public readers cannot retrieve reporter identity. Station staff cannot publish for a different station.

### Phase 5: Enable a Controlled Roadside Workflow

- **Code areas:** `roadside-assistance.tsx`, provider dashboard/services, admin/provider route catch-alls, existing request/quote/provider APIs, and new restricted onboarding, inquiry, coverage, and quote APIs.
- **Database/migrations:** provider public identity/private contact, service area and last verification; owned inquiries; quote terms/version and approval; consent/idempotency; request events; complaints and audited approval/assignment. Review/update existing request RPCs and legacy visibility.
- **User result:** a willing approved provider can receive a suitable inquiry, offer an actual quote, and fulfil an explicitly confirmed request within agreed hours. An operator may broker this process during the pilot.
- **Dependencies:** verified providers, coverage, scope/pricing/cancellation agreement, appropriate local requirements review, operator duty rota, complaint contact, and transport/safety boundaries. No eligible partner means simulated workflow only, not live requests.
- **Done/tests:** complete Driver/operator/provider flow on separate devices; expired/foreign/revised quotes, offline/suspended providers, outside-area pickup, cancellation races, duplicate confirmation, invalid status transitions, and reconnect pass. Only necessary information is shared. A declined quote is never silently sent to a different provider. Run an expressly agreed supervised real task only after these gates pass.

### Phase 6: Deliver the Document's Scoped 3D Experience

- **Code areas:** add a focused Cesium component and renderer adapter beside `station-map.tsx`/`truecost-map.tsx`; integrate the same station/route results in `station-discovery.tsx` and `truecost-feature.tsx`; update the actual map build/asset settings in `next.config.ts` as required by installed Cesium guidance.
- **Database/migrations:** usually no new Driver data. Version and document footprint/terrain sources separately; add geometry storage only when needed for the bounded dataset.
- **User result:** camera controls, station/route overlays, available terrain/roads, and simple footprint extrusions in the chosen area; immediate 2D/list fallback on slow or unsupported devices.
- **Dependencies:** verify dataset coverage/licences, heights or explicitly generic extrusions, terrain access, attribution, and optional hosted-content terms. CesiumJS software does not supply a paid-content entitlement.
- **Done/tests:** real-phone desktop/mobile screenshots and nonblank scene checks; same data/ranking across 3D/2D; markers and overlays are correctly placed; blocked terrain/token/WebGL and low memory have usable fallback. Record loading time, stutter, heat concerns, and 2D use. No fabricated buildings or complete-city claims. This is required before declaring the final consolidated MVP complete.

### Phase 7: Prepare Operations and Run the Bounded Pilot

- **Code areas:** event-based notifications/settings; working admin request/complaint/audit/coverage screens; translations; redacted monitoring and readiness checks; `public/sw.js`; checked-in browser tests; later update deployment and pilot documentation.
- **Database/migrations:** notification read state, append-only critical events, consent/retention jobs, and coverage summaries where absent. No raw location in general analytics.
- **User result:** tested adults can use the app during declared hours; staff can correct information, see failures, and respond to complaints.
- **Dependencies:** owner-approved consent sheet, support rota, trained staff, verified station/provider records, tested integration accounts, and an authorised HTTPS staging/pilot deployment. Deployment requires a separate decision; none is performed by this plan.
- **Done/tests:** follow Section 6; run current unit/lint/build checks, staging ownership tests, browser flows, device/network testing, recovery drills, and licence review. Produce a pilot report with denominators and known limitations. No emergency or fuel-delivery trials.

### Phase 8: Decide on Broader Launch

- **Code areas:** optimise the existing APIs/indexes/caching, monitoring, deployment workflow, account lifecycle, and partner administration based on measured failures. Add external notification channels or offers only with proven need and consent/redemption capability.
- **Database/migrations:** load-test-driven indexes/queries; tested backups/restore; safe archival/retention; verified offers only if commercial agreements exist.
- **User result:** reliability and coverage can be expanded deliberately, not merely by increasing the map radius.
- **Dependencies:** pilot report, budget approval, service terms, provider coverage, sustainable moderation/support workload, and security/privacy review.
- **Done/tests:** all Section 6 expansion gates pass; restore rehearsal succeeds; quotas/cost alerts and incident response work; new areas pass station/provider checks before being enabled. Optional AI explanation remains a later addition and must use validated results, not invent prices, stock, or eligibility.

## 4. Real Data and Partners

### 4.1 Station Names, Pins, Fuels, and Details

- **Starting source:** the existing Overpass importer requests OSM fuel nodes/ways/relations in a Faisalabad bounding box. It sets records unverified. Use it as leads, not field truth or stock confirmation.
- **Who maintains it:** named local data operator, with participating station staff confirming public details and an admin approving changes.
- **What to verify:** correct entrance/pin, duplicate node/way records, name/brand, fuel categories, closures, source date, and any claimed opening information. Do not fill empty fuel arrays from guesses about a brand.
- **Maintenance:** keep field-check date, source record, import date, and actual observation date separate. Set a weekly pilot review and immediate correction channel; decide later cadence from observed changes. An import must not reset manual approval.
- **Access/licence:** preserve OSM attribution/source IDs and review ODbL obligations for derived/distributed datasets. Public map tiles are a separate service, not automatically granted by access to OSM data. [OSM copyright and licensing](https://www.openstreetmap.org/copyright).
- **Fallback:** a smaller manually verified pilot list with permission/source evidence. If no verification exists, label metadata unverified/unknown and avoid claims of complete coverage.

### 4.2 Price References

- **Starting source:** the repo points to [OGRA price publications](https://price.ogra.org.pk/?section=daily-fuel). This review confirmed a publication portal exists, not a guaranteed structured API or the correctness of today's parsed retail amount.
- **Who maintains it:** designated admin checks the actual published document, fuel grade/unit, applicable area/scope, effective date, and whether the referenced figure is suitable for this product.
- **Implementation approach:** begin with reviewed manual entry through the existing admin price screen. Later add a scheduled fetch/parser with fixture tests, change detection, review/quarantine on unusual values, and an alert on failures. Both nearby search and TrueCost must consume the same reviewed records.
- **Station prices:** a reference amount is not a confirmed price at every station. A station-specific figure needs staff confirmation, source/time, validity, and clear display. No redeemable discount without an agreement and redemption rules.
- **Fallback:** show last checked/effective date and stale/unknown status. If current pricing cannot be supported, suppress live-looking monetary comparisons; retain personal assumptions separately.

### 4.3 Availability and Its Meaning

| Label | Evidence required | Display and fallback |
| --- | --- | --- |
| Official/reference data | Identifiable publication and date/scope | Useful price or metadata reference; never proof of station stock. |
| Station-confirmed recently | Assigned approved staff, fuel, observation time, expiry | Say who confirmed by role/station, not private identity. Confirmation is time-bounded, not a guarantee on arrival. |
| Community report | Authenticated observation, moderation/trust state, time | Say Community reported, not Station confirmed. A reviewed report is still community evidence. |
| Reported unavailable | Explicit negative report with source/time | Do not infer this from a failed API, missing metadata, or silence. |
| Queue reported | Explicit recent observation | No invented queue length or waiting time. |
| Stale | Previously accepted observation whose expiry has passed | Show last observation, explain it needs rechecking, and do not rank it as current confirmation. |
| Unknown | No usable accepted report | Offer other station information or alternatives without calling it a shortage. |

Moderation time must not reset an old observation's freshness. Choose an explicit conflict rule: display contradictory recent evidence with caution or request operator review rather than silently asserting certainty. Preserve pending/rejected evidence privately where needed for moderation; publish only safe facts. There is no verified automatic stock feed in this repository. If station staff cannot commit to updates, the product must work with Unknown instead of inventing confidence.

### 4.4 Providers, Coverage, and Quotes

- **Recruit directly:** local puncture/tyre shops, battery-service operators, and towing businesses willing to test. Neither a map listing nor an active toggle is a partnership.
- **Who provides access:** each participating business agrees to its public identity, contact process, service types, area/hours, quote process, and pilot conditions. The project owner approves the evidence and operating protocol.
- **Eligibility:** record business/contact verification, capability for the requested service/vehicle, any applicable authorisation/insurance requirements confirmed with qualified local advice, last review, and suspension reasons. Collect sensitive evidence privately and minimally.
- **Coverage:** a radius/polygon can be an initial service area, but the provider must confirm actual access/capacity for the pickup. Approval, coverage, online state, and quote willingness are separate checks.
- **Quotes:** the provider supplies the actual amount/scope; a trained operator may enter it through an audited tool with provider confirmation evidence. Store expiry, exclusions, consent, and accepted terms. An admin reference service price is not a binding quote.
- **Updates:** provider acknowledges and changes real status; the operator follows up when a request is unanswered or disputed. Record acknowledgement time as an observation, not an ETA promise.
- **Fallback:** no provider/quote, no dispatch. Use the labelled sample walkthrough for research. Do not contact or send a non-participating business on a participant's behalf.

### 4.5 Maps, Routes, Geocoding, and 3D Data

| Integration | Existing position | What must be verified and by whom | Fallback |
| --- | --- | --- | --- |
| MapLibre + MapTiler | 2D renderer and public key hook exist. Previous implementation checks recorded HTTP 403 for the supplied key; access must be rechecked after rotation. | Account owner checks product permissions, hostname restrictions, licence for the intended pilot/commercial use, quotas, and local map detail. [MapTiler terms](https://www.maptiler.com/terms/cloud/). | Working station list/coordinates/directions. Select an alternative only after its terms/access are reviewed. |
| OSRM | Server adapter accepts a configured base URL; no automatic public demo endpoint. | Developer/operator confirms who hosts it, road extract quality, route profile, access, uptime, server cost, and map updates. [OSRM API documentation](https://project-osrm.org/docs/v5.24.0/api/). | Label consistent straight-line comparisons approximate; no road ETA or road-cost claim. |
| OpenRouteService | Server-key adapter and timeouts exist. | Account owner confirms plan, endpoint access, Pakistan/Faisalabad test routes, waypoint/request limits, storage terms, cost, and expected availability. [API restrictions](https://openrouteservice.org/restrictions/). | Same explicit route failure behaviour, or a reviewed self-hosted routing deployment. No guaranteed access asserted here. |
| Destination/place lookup | No general geocoder is wired. | Choose a provider whose terms, local address quality, rate limits, storage rules, and privacy fit. If researching public Nominatim, note its app-wide usage limits, attribution/identification requirements, prohibition of autocomplete, and confidentiality restrictions. [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/). | Known pilot landmarks/manual area/pin selection; coordinates remain a technical fallback, not the only normal-user interaction. |
| CesiumJS | Required by the final direction but absent from package dependencies. | Developer checks installed-version setup, self-hosted assets, mobile/WebGL performance, and renderer licence. [CesiumJS](https://cesium.com/platform/cesiumjs/). | Existing 2D/list experience. Do not imply the final 3D feature was delivered when it was not. |
| Terrain/buildings | No connected dataset or pipeline. | Owner/developer verifies actual bounded-area footprint/elevation coverage, licence, redistribution, heights, hosting/egress, and any provider token. [Cesium ion](https://cesium.com/platform/cesium-ion/) is an optional hosted-content candidate, not a free entitlement. | Flat terrain/simple verified footprint blocks with stated limitations, or omit unsupported detail. |

Do not use public OSM tile servers or public routing demo servers as guaranteed production infrastructure. OSM's [tile policy](https://operations.osmfoundation.org/policies/tiles/) has specific access/usage requirements. Never substitute a world demo map and present it as useful Faisalabad road coverage. Map rendering and route calculation are separate dependencies; one working does not prove the other works.

## 5. Security, Privacy, Safety, and Operations

### 5.1 Permissions and Trusted Writes

- Drivers own only their profile, vehicles, fuel logs, inquiries, quotes, requests, and complaints. Public station browsing remains available without exposing personal reports or pickup locations.
- Keep role checks in APIs and database rules. Do not rely on hidden buttons or a supplied `user_id`. Derive ownership from validated authentication; test direct REST/RPC calls as well as web pages.
- Audit column grants and triggers for forged report source/expiry, quote price, provider approval, role changes, and request completion. Review privileged functions individually. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) explains the database boundary; existing repo tests are a starting point, not a full audit.
- Restrict provider reads to necessary eligible inquiries/assigned requests. Do not expose all unassigned precise pickups to every approved provider. Drivers confirm sharing with the selected provider; operator access is limited and audited.
- New source/price/approval/coverage/event tables need ownership/role policies and explicit grants. Tests must cover another Driver, pending/suspended provider, unassigned station staff, anonymous access, and admin permissions.

### 5.2 Consent, Location, and Retention

Browser location permission is not the whole consent process. Explain who receives coordinates: the app, selected map/routing services as needed, the pilot operator, and a selected roadside provider when agreed. Provide manual area/pin alternatives. Do not start continuous/background tracking.

For station/route search, keep precise coordinates only as long as the operation requires unless a reviewed short-lived cache is needed. For real roadside work, save only the location/contact evidence required for fulfilment and disputes. Do not send raw route bodies, contact phones, or coordinates into analytics/error reports. Third-party maps, routing, and external directions links have their own privacy effects; explain these and review processor terms.

Proposed pilot policy, requiring owner approval before consent: delete raw session recordings/research location traces within 30 days after the pilot; redact precise pickup/contact information within 30 days after request closure unless an unresolved dispute requires a documented exception. Retain anonymised measurements, not full location histories. Drivers' saved logs remain under their account policy. Establish consent/contact/audit retention separately, and explain when deletion reaches backups. These are proposed operational choices, not legal retention requirements.

Add withdrawal/deletion requests, an operator responsible for fulfilling them, and a tested anonymisation/deletion process that respects related records. Obtain qualified local privacy/legal advice before live collection or expansion; this plan does not certify legal compliance.

### 5.3 Secrets and Abuse Controls

- Rotate previously shared management tokens, database passwords, weak/shared test credentials, and exposed provider keys before the pilot. Verify revocation and update only approved secret stores. Do not use the seeded demo login as a public participant account.
- Public Supabase publishable/legacy anon keys are different from secret/service-role credentials. Map public keys should have hostname/usage restrictions. Keep routing keys, database passwords, SMTP/SMS secrets, and management tokens out of `NEXT_PUBLIC_*`, Git, logs, and this plan.
- Use separate development, staging, and pilot/live environments. Restrict staff accounts, review MFA options for privileged staff, keep a documented recovery owner, and never share an admin login.
- Add durable limits for OTP attempts, reports, inquiries, quote actions, routing, and future TTS. Per-process memory limits alone are not reliable across server instances. Limit both API calls and direct allowed database operations where needed.
- Handle duplicate and malicious reports, abusive notes, scripted requests, and excessive routing costs. Provide moderation reasons, appeals, suspension, and a correction channel. Do not publish accusations against a station/provider from unverified reports.

### 5.4 Quote, Complaint, and Safety Operations

Before dispatch, show the actual provider, pickup, service scope, amount, quote expiry, cancellation rules, and necessary information-sharing consent. Record acceptance and lock the agreed amount/terms. The server must validate eligibility again. A change in provider or terms needs fresh confirmation.

Assign an operator for the declared pilot hours. Define what happens when a provider does not answer, declines, fails to arrive, disputes scope, or cannot complete the service. Keep a private complaint record, acknowledge receipt, investigate with evidence, and record the resolution/appeal. Do not promise refunds before deciding who collects payment and who has authority to resolve disputes. Keep payments out of the initial software scope unless separately approved; any direct provider payment terms must be disclosed.

All participant tasks occur while parked or with a passenger/researcher operating the app. No induced breakdowns, unsafe stops, phone interaction while driving, or app-led emergency trials. Route suggestions do not certify road safety. Emergency guidance should direct users to official local services whose current contact details the team verifies before publication; do not guess numbers.

**Fuel delivery remains out of scope.** Any later proposal needs verified authorised providers, applicable transport/handling/safety requirements, insurance/liability review, and separate owner approval. No peer-to-peer fuel handling or informal delivery trial.

### 5.5 Operational Readiness

Document: who checks prices; who refreshes stations; who moderates reports; who covers provider requests; who handles complaints; who owns hosting/billing; and who responds to a security incident. Set a daily pilot-start check for sources, active coverage, sign-in, map/routing failures, and support availability.

Add redacted error logs, uptime checks, source-age warnings, quota/cost alerts, database backups and a restore rehearsal. Review service-worker updates so old clients do not keep obsolete workflows. Do not cache authenticated pages, requests, or OTP data as public offline content, and do not silently queue a real roadside dispatch while disconnected.

## 6. Faisalabad Pilot and Launch Plan

### 6.1 Prepare the Pilot

Choose one bounded area, for example a Susan Road/D Ground corridor, only after local staff check it. The name is a proposal, not evidence of complete station/provider coverage. Record a boundary, permitted service area, operating hours, operator contact, participant cap, and stop conditions.

Prepare a checked dataset of 15-30 stations where practical; fewer accurate records are acceptable. Recruit 2-4 willing station staff for verification/limited confirmation windows. Interview 2-4 provider representatives for workflow research; before any live dispatch, aim to onboard 3-5 willing verified providers with sufficient category/area coverage. These are recruitment targets, not claimed existing partners. If a category has no eligible partner, keep it simulated or unavailable.

Invite 8-12 adult drivers for moderated tests, including car/motorcycle users and people less comfortable with map apps. Start with 3-5 friendly users, then grow to 20-30 only if the early issues and operations are under control. This is a small qualitative pilot, not a statistically representative survey.

Prepare: separate participant accounts, reviewed translations, a consent sheet, anonymous participant IDs, a task script, a feedback form, field-check evidence, a support rota, a known-limitations page, and a cost cap. Get separate opt-in for location, recordings/photos, follow-up contact, and each real service request. Compensation, if offered, must not depend on positive feedback.

### 6.2 Run the Sessions

Use this order after the relevant engineering gates pass. Weeks are suggestions, not commitments:

- **Week 1:** internal/staging QA and 3-5 parked friendly-user sessions. Fix critical account, source-label, and coordinate errors.
- **Week 2:** 8-12 moderated Driver sessions. Test discovery, details, fuel filters, profile/vehicle/log tasks, road-route comparisons, and interpretation of station/community/stale/unknown information.
- **Week 3:** field-check selected pins and timestamped station confirmations; test provider inquiries/quotes/status on separate devices. A real request requires prior provider agreement and separate Driver confirmation; otherwise use simulation.
- **Week 4, if ready:** 20-30 broader sessions in the same boundary, with support staffed. Test the scoped 3D view on real phones and the 2D fallback, not just a desktop demo.

Include slow networks, denied GPS, no voice support, locked phones, map/routing failures, offline recovery, RTL text, keyboard navigation, no-provider cases, and expired quotes. Ask participants to explain the estimates/statuses in their own words. Do not provide hints before recording task completion; help afterward and note the intervention.

If only seven days are available, run a compressed formative test with existing ready features. Report unbuilt features honestly; do not turn time pressure into fake sources, skipped permissions, or an unsafe live dispatch.

### 6.3 Measure and Learn

| Measure | Practical method | Initial interpretation |
| --- | --- | --- |
| Core task completion | Count unaided completed tasks and interventions. | Aim for at least 80% in the small pilot; report participant/task counts, not a population claim. |
| Time on task | Record from prompt to useful result. | Establish a baseline before setting a hard target. |
| Data correctness | Compare included pins/fuels/details with a visit or confirmed staff source. | Fix every critical pin/fuel error before expansion; report checks and mismatch counts. |
| Freshness comprehension | Ask what Confirmed, Community reported, Stale, and Unknown mean. | Unknown must not be interpreted as a proven shortage. Revise copy and retest confusion. |
| Availability reliability | Compare observations against timestamped station confirmation where possible. | State the sample size and time lag; no general live-stock accuracy claim. |
| TrueCost correctness | Automated fixtures plus hand-calculated test cases. | Deterministic tests pass within stated rounding; no guaranteed savings claim. |
| Route usefulness | Compare sampled detours with a trusted result and local feedback. | Record failures and inconsistent routes; do not certify route safety. |
| Provider workflow | Observe eligible inquiry, quote, acceptance, status, and complaint paths. | Record actual acknowledgements/completion and no-response cases; no promised ETA. |
| 3D/mobile performance | Record phone/browser, load failures, stutter, heat, and fallback usage. | The core task must remain possible in 2D/list. |
| Repeat-use intent | Short interview about trust, missing facts, and reasons to return. | Combine comments and counts; do not generalise from a few users. |
| Operating effort/cost | Count verification calls, moderation, support time, map/route/email usage. | Use measured consumption to set the next budget and staff capacity. |

Collect a short weekly issue list with owner, severity, evidence, and retest result. Publish a final report with recruitment method, consent, sample sizes, observations, fixes, limitations, and a go/no-go decision. Do not turn participant/business involvement into endorsements.

### 6.4 Gates Before Expansion

Expand one area at a time only when all of these are true:

- New Driver registration and core tasks work on representative phones, desktop, relevant languages, and a usable 2D fallback. The final required 3D view has been tested with its real limitations.
- Included pins and fuel metadata are checked; price scope/date and freshness are explicit; disputed or unsupported data is not presented as current fact.
- TrueCost tests pass, routing access/terms are confirmed, and unavailable prices/routes do not produce live-looking claims.
- Providers are approved, service-area filtering works, quote confirmation is enforced, and actual support/complaint capacity matches advertised hours and categories.
- No unresolved high-risk privacy, ownership, secret, consent, or abuse issue remains. Retention/deletion and backup restore have been tested.
- Hosting/data/service licences, quotas, and costs are owner-approved; monitoring and source-update operations have named owners.
- A pilot report records failures as well as successes. Any unmet gate keeps that feature/area closed; widening the map does not count as readiness.

## 7. Costs and Manual Setup

No current subscription price, quota entitlement, Pakistan service availability, or partnership is assumed here. Obtain a dated estimate from each selected service for the actual intended use before spending. Free software is different from free hosted data, delivery, or operations.

| Item and owner | Prototype/low-cost approach | Pilot/production costs and manual confirmation |
| --- | --- | --- |
| Web hosting/domain: project owner | Local Next.js; an authorised preview plan for research after terms review. | HTTPS domain, suitable commercial hosting, runtime limits, logs/alerts, bandwidth, rollback, and regional performance. No host is selected by this plan. |
| Supabase: account owner/developer | Existing project or isolated free/local staging within verified limits. | Database compute/storage/egress, backups, restore options, logs, support, and environment separation. Check the actual account and [current plans](https://supabase.com/pricing); do not infer backup protection from a free tier. |
| Email: account owner | Controlled developer inboxes; test verified SMTP access. | SMTP account, authenticated sending domain, sender address, delivery limits, bounce/abuse handling, and per-message charges if applicable. Default Supabase mail is not a dependable public-pilot solution; [custom SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp) describes its restrictions. |
| SMS/phone OTP: owner | Leave phone registration disabled/unadvertised until tested. | Provider account, sender rules, local network delivery, country availability, compliance, and actual message cost must be confirmed. Repo local SMS configuration is disabled; that does not prove hosted project settings. |
| Map tiles/geocoding: owner/developer | Research-only access where expressly permitted, or a licensed bounded dataset. | Key ownership, allowed hosts, commercial terms, request/map-session usage, quota alerts, geocoding quality, attribution, and caching rights. Do not assume MapTiler's free/R&D terms cover a broader commercial launch. |
| Routing: developer/operator | An existing suitable machine for a bounded self-hosted OSRM experiment, or explicitly approved provider evaluation access. | Machine/RAM/storage, maintenance, road updates, request quotas, server/network charges, and privacy. OpenRouteService access and Faisalabad route suitability need actual confirmation. |
| Cesium/terrain/buildings: developer/owner | Open-source CesiumJS plus properly licensed available footprints; simple extrusions. | Terrain/3D content licences, ion or other account/token if chosen, hosted-content entitlement, processing/egress, and device performance. Do not equate renderer licence with content access. |
| Station/provider verification: local operator | Manual calls/visits with a small cohort. | Transport, data/phone use, staff time, re-verification, agreements, complaint support, and any provider service payments. None are zero-cost by assumption. |
| Research: owner/researcher | Modest supervised sessions and simple consented forms. | Participant transport/data reimbursement, accessible translation review, safe venues, recordings/storage, and analysis time. Set budget and consent first. |
| Monitoring/security: developer/owner | Existing logs plus local/staging tests, with redaction. | Reliable alerts, retention, backup/restore, security review, staff access controls, and incident time. Use only tools whose data handling is approved. |
| Speech and external notifications: owner | Browser speech and in-app polling only. | Optional recordings, TTS, SMS/email/push services, language support, delivery cost, rate limits, and separate consent. Defer until usefulness is demonstrated. |

If considering Vercel because the app uses Next.js, first check [Hobby-plan permitted use](https://vercel.com/docs/plans/hobby); do not assume a free personal plan fits commercial deployment. It is a candidate, not verified current hosting.

Prepare a simple budget sheet with: account owner, confirmed plan/licence, setup cost, monthly base cost, unit cost, expected volume, spending cap, renewal date, and fallback. Estimate volume from sessions: participants x sessions x comparisons x base/via route calls, plus map loads, OTP messages, storage, and operator hours. Use measured pilot consumption to revise it. No fixed monthly total is promised.

### Manual Setup Checklist for Future Work

- Owner confirms GitHub, Supabase, hosting, domain, and service account access; rotates/revokes exposed credentials and restricts staff access.
- Developer documents environment-variable names and verifies production values without printing secrets. Existing key hooks are `NEXT_PUBLIC_SUPABASE_URL`, publishable/anon equivalents, `NEXT_PUBLIC_MAPTILER_KEY`, `OSRM_BASE_URL`, and `OPENROUTESERVICE_API_KEY`; importer service credentials remain private and outside browser bundles.
- Owner configures approved email delivery and redirect URLs; tests actual participant inboxes. Phone/SMS remains conditional.
- Local operator obtains station/provider participation permissions and evidence; assigns approved station staff and service coverage through reviewed tools.
- Owner approves source licences, privacy/consent/retention wording, support hours, budget cap, and emergency guidance verification.
- Developer creates reviewed migrations and a staging deployment only during a separately authorised implementation phase, then verifies backups/restore and tests before any live enablement.

External links in this plan were checked as documentation/reference sources during the review. They do not verify account entitlements, fresh pump prices, physical coverage, provider approval, or access from Pakistan. Recheck current terms and sources before integration. The document's final consolidated section remains the product authority; current code/database observations remain the implementation baseline.

## 8. Exact First Five Actions

1. **Choose and write down one Faisalabad pilot boundary and operating model.** The project owner and a local operator choose the area, hours, petrol/diesel-first scope, participant cap, support contact, and no-fuel-delivery rule. Deliverable: a one-page pilot brief naming the people responsible for data, software, and requests.
2. **Secure and confirm the existing accounts before recruitment.** The account owner rotates credentials previously shared in chat, retires weak/shared demo access for participants, confirms the intended Supabase/staging/hosting accounts, and records what is actually configured for sign-up, backups, maps, and routing. Deliverable: a secret-free access/readiness checklist; no purchases or deployment until approved.
3. **Field-verify the first 15 station leads and speak to willing providers.** Use the existing 82 records as leads, check each chosen pin/name/fuel type/source, and invite 2-4 station staff plus provider representatives to discuss coverage and quotes. Deliverable: a dated verification sheet and written participation interest, not invented partnerships; keep updates reviewed rather than running an unrestricted re-import.
4. **Prove the needed external access and prepare safe research.** Owner/developer verify real-inbox email delivery, permitted map tiles, a small Faisalabad route set, price-publication meaning, and 3D-data options; obtain dated terms/cost information. Local operator drafts consent, retention, tasks, and support protocol. Deliverable: a dependency matrix marking each item Working, Needs access, or Fallback only, plus a consent/task pack. No real dispatch while a required dependency is unresolved.
5. **Approve the first small implementation batch and schedule formative tests.** Turn Phases 0-3 into owned tickets for security/account readiness, verified station metadata, one reviewed price source, accurate history, and route comparison; assign later tickets for reports, provider quotes, and required 3D work. Recruit 3-5 adults for parked tests only after those tickets' readiness gates pass. Deliverable: an ordered backlog with acceptance tests and a supervised test date, not an unsupported launch promise.
