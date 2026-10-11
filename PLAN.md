# Chalo Yaar — implementation plan

**Status:** Awaiting approval; no application code is included in this milestone.  
**Pilot:** Faisalabad, Pakistan.  
**Source read:** `Chaloyaarmvp.docx` in the workspace root. The brief refers to `docs/Chaloyaarmvp.docx`, but that path does not exist in the supplied workspace; the provided root-level document was read in full.

## 1. Decisions from the PRD and conflicts resolved

The document has an original MVP section and a later **Final Consolidated MVP**. Where those sections disagree, this plan follows the later section except where your explicit product rules below it are more specific.

| Topic | Earlier MVP | Final Consolidated MVP | Plan decision |
|---|---|---|---|
| Map | 2D map; MapLibre or Leaflet is suggested. | CesiumJS interactive 3D map, with a 2D fallback. | Use **2D MapLibre only in v1**, as explicitly required. Keep a renderer boundary so 3D can be considered later; no Cesium bundle or 3D controls in this build. |
| Fuel delivery | Lists emergency fuel as a roadside-request type. | Excludes unauthorized fuel delivery and lists puncture, battery and towing as the service categories. | No fuel-delivery request category or fuel delivery workflow in v1. Only approved providers can receive the three supported request types. |
| Fuel prices | Suggests station-specific `fuel_prices` and price comparison. | Lists station price records but also emphasizes trustworthy source data and no unsupported pump claims. | Your rule is authoritative: store one admin-entered **national reference rate per fuel type and effective date**, not station prices. Never scrape or crowdsource prices. |
| AI | Optional LLM API to interpret questions/explain results. | No custom-trained model; an existing LLM is optional. | No LLM in v1. Search, ranking, availability, and TrueCost are deterministic and explainable. Browser speech recognition is a progressive enhancement, not a source of facts. |
| Availability labels | Available, unavailable, queue reported or unknown; stale reports expire. | Confirmed recently, reported unavailable, stale or unknown. | Preserve report status and freshness as separate facts. Display a single safe state with source/time; an expired report is **Stale**, while no report is **Unknown**. Never infer unavailability from missing data. |
| Discounts | Describes partner-funded savings and offers. | Keeps TrueCost but the minimum consolidated schema does not detail offers. | Include an admin-verified, currently redeemable offer model. Never accept a client-supplied discount or imply a pump price reduction. |
| Pilot maturity | Hackathon-ready demo with seeded data. | A structured, supervised Faisalabad pilot with consent and field checks. | Build demo-labelled flows first; live provider workflows remain gated on provider approval, consent, legal/safety checks and an explicit launch decision. |

The 2D-only decision is a deliberate exception to the consolidated map direction, because your more specific v1 UI requirement explicitly rules out 3D. The practical spatial features remain: PostGIS search, route-aware detours, explainable ranking and provider coverage matching.

## 2. Architecture and folder structure

### Proposed architecture

- **Web:** Next.js App Router, TypeScript, Tailwind CSS, next-intl, installable PWA. Server components for initial/read-only views; route handlers for validated, authenticated mutations and provider integrations.
- **Database/auth:** Supabase Auth and PostgreSQL with PostGIS. RLS on user, provider, report, quote, and request data. Privileged keys remain server-side only.
- **Shared domain:** A framework-independent `packages/core` TypeScript package owns freshness derivation, request transitions, TrueCost, eligibility, and deterministic ranking. Web/API code consumes it; it has no React, Next.js, database-client, or browser dependencies.
- **Map:** MapLibre GL JS with a production-permitted tile source. Render 2D by default and keep map lifecycle/marker/route contracts behind a small adapter so a future renderer can replace it without moving business logic.
- **Station seed:** A one-time Overpass import for Faisalabad OSM `amenity=fuel` features, normalized and reviewed before import. OSM is a location seed, not verification of opening, fuel stock, or prices. Mark seeded demo records conspicuously.
- **Routing/geocoding:** Server-side adapters, not client calls to public demo endpoints. Return the provider's road distance/route when available; use a clearly labelled straight-line approximation on routing failure. Never fabricate an ETA. Geocoding is separately replaceable.
- **Operational boundaries:** Every external integration is behind a small adapter; configuration and secrets are server-only. Rate limits, timeouts, cache TTLs, attribution, and provider terms are explicit.

### Initial repository layout

```text
apps/
  web/
    app/[locale]/                 # Locale-aware routes and layouts
    app/api/                      # Validated Next.js route handlers
    components/                   # Design system and accessible UI
    features/                     # Fuel, reports, vehicles, help, admin
    lib/                          # Supabase, auth, i18n, TTS, adapters
    messages/{ur,en,ur-Latn,pa-Arab}.json
    public/audio/                  # Small fixed-phrase audio assets
    public/                        # PWA manifest, icons, offline shell
packages/
  core/
    src/{availability,ranking,truecost,requests,validation}/
    test/
  contracts/                      # Shared API schemas/types if needed
supabase/
  migrations/
  seed.sql                         # Clearly marked demo records
scripts/
  import-osm-stations.ts           # One-time, repeat-safe Overpass importer
docs/
  translation-review.md            # Machine-written strings awaiting review
  MOBILE-READINESS.md               # Updated after every milestone
README.md                           # Setup, env vars, service/licence checklist
PLAN.md
```

Use an npm workspace for this Windows environment: npm is already installed, while pnpm was not available, so this avoids a separate package-manager installation. Avoid a separate backend service for v1: Next.js route handlers are sufficient and keep the deployment surface small.

## 3. Data model and migration plan

### Migration sequence

1. `001_extensions_and_types.sql`: enable PostGIS; create constrained enums/domains for fuels, availability report values, moderation, service types, provider approval, and request/quote states.
2. `002_stations_and_official_prices.sql`: OSM-sourced station records, coordinate provenance, demo flag, station verification/correction fields, national official fuel-price history, and spatial/search indexes.
3. `003_profiles_vehicles_and_logs.sql`: profiles and separately protected role grants, vehicles and fuel logs.
4. `004_reports_and_offers.sql`: availability reports, expiry/moderation fields, verified offers and redemptions.
5. `005_providers_and_assistance.sql`: provider onboarding/coverage, requests, provider quote offers and itemized quote lines, request event history.
6. `006_rls_audit_and_retention.sql`: enable RLS on every application table, policies, narrowly scoped admin helpers, audit records and retention/purge support.

### Core schema (migration design)

The following is the intended SQL shape for Supabase PostgreSQL; exact policies, constraints, and helper-function ownership will be implemented and tested with each feature migration.

```sql
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create type public.fuel_type as enum ('petrol', 'diesel', 'cng');
create type public.reported_availability as enum
  ('available', 'unavailable', 'queue_reported');
create type public.report_moderation as enum ('pending', 'approved', 'rejected');
create type public.provider_approval as enum ('pending', 'approved', 'suspended');
create type public.service_type as enum ('puncture', 'battery', 'towing');
create type public.request_status as enum
  ('requested', 'quoted', 'confirmed', 'en_route', 'completed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_language text not null default 'ur'
    check (preferred_language in ('ur','en','ur-Latn','pa-Arab')),
  created_at timestamptz not null default now()
);

-- Role grants are not writable by ordinary users; never trust a client profile role.
create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','provider','admin')),
  primary key (user_id, role)
);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  address text,
  osm_type text,
  osm_id bigint,
  location extensions.geography(Point, 4326) not null,
  supported_fuels public.fuel_type[] not null default '{}',
  opening_info jsonb,
  source text not null,
  source_url text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);
create index stations_location_gix on public.stations using gist (location);

-- National reference only: intentionally has no station_id.
create table public.official_fuel_prices (
  id uuid primary key default gen_random_uuid(),
  fuel_type public.fuel_type not null,
  price_per_litre numeric(10,2) not null check (price_per_litre > 0),
  source_name text not null,
  source_url text,
  effective_at timestamptz not null,
  entered_by uuid not null references auth.users(id),
  entered_at timestamptz not null default now(),
  is_demo boolean not null default false
);
create index official_fuel_prices_current_idx
  on public.official_fuel_prices (fuel_type, effective_at desc);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  vehicle_type text not null,
  fuel_type public.fuel_type not null,
  estimated_km_per_litre numeric(8,2)
    check (estimated_km_per_litre > 0 and estimated_km_per_litre <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vehicles_user_idx on public.vehicles(user_id);

create table public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  litres numeric(10,3) not null check (litres > 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  odometer_km numeric(12,1) check (odometer_km >= 0),
  logged_at timestamptz not null default now(),
  is_demo boolean not null default false
);
create index fuel_logs_user_date_idx on public.fuel_logs(user_id, logged_at desc);

create table public.availability_reports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  fuel_type public.fuel_type not null,
  reported_status public.reported_availability not null,
  source_type text not null check (source_type in ('user','station','admin')),
  reporter_id uuid references auth.users(id) on delete set null,
  moderation_status public.report_moderation not null default 'pending',
  reported_at timestamptz not null default now(),
  expires_at timestamptz not null,
  is_demo boolean not null default false
);
create index reports_station_fuel_time_idx
  on public.availability_reports(station_id, fuel_type, reported_at desc);
create index reports_expiry_idx on public.availability_reports(expires_at);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  service_types public.service_type[] not null,
  service_area extensions.geography(MultiPolygon, 4326) not null,
  approval_status public.provider_approval not null default 'pending',
  active boolean not null default false,
  contact_details jsonb not null,
  last_verified_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index providers_area_gix on public.providers using gist (service_area);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  service_type public.service_type not null,
  pickup_location extensions.geography(Point, 4326) not null,
  vehicle_details jsonb not null default '{}',
  contact_details jsonb not null,
  status public.request_status not null default 'requested',
  assigned_provider_id uuid references public.providers(id),
  location_purge_after timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_user_date_idx on public.service_requests(user_id, created_at desc);

-- Created only for approved providers matching the request type and coverage.
-- A provider's quote is an acceptance/proposed offer; decline is recorded separately.
create table public.request_provider_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id),
  response_status text not null default 'offered'
    check (response_status in ('offered','declined','quoted','expired')),
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (request_id, provider_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  provider_offer_id uuid not null unique
    references public.request_provider_offers(id) on delete cascade,
  currency text not null default 'PKR' check (currency = 'PKR'),
  expires_at timestamptz not null,
  offered_at timestamptz not null default now(),
  confirmed_at timestamptz,
  is_demo boolean not null default false
);
create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  label text not null,
  amount numeric(12,2) not null check (amount >= 0),
  sort_order smallint not null
);

create table public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null,
  safe_public_message text,
  created_at timestamptz not null default now()
);

create table public.verified_offers (
  id uuid primary key default gen_random_uuid(),
  partner_name text not null,
  fuel_type public.fuel_type not null,
  discount_per_litre numeric(10,2) not null check (discount_per_litre > 0),
  max_eligible_litres numeric(10,3) check (max_eligible_litres > 0),
  terms text not null,
  redemption_rules jsonb not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  verified_by uuid not null references auth.users(id),
  verified_at timestamptz not null default now(),
  active boolean not null default false,
  check (ends_at > starts_at)
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

### Data and privacy rules

- Public station queries expose only approved public fields; OSM presence is not station verification. Public price reads return the latest applicable national rate with source, effective date, entry time, and demo marker.
- A report's current UI state is derived server-side from the latest eligible report, moderation, and expiry. Preserve its original reported value and timestamp so the UI can say “Stale — last report said Available” without presenting that as current.
- Provider status defaults to pending. Only admins can approve/suspend. Server-side matching requires both approval and service-area inclusion before a provider can receive a request. RLS independently blocks pending providers.
- Users can read/write only their own vehicles, logs, reports and requests; provider access is limited to approved, eligible work and necessary fields. Admin controls use server-verified roles, not client claims.
- Enable RLS on **every** user/provider/request-related table; add explicit policies for each operation. No direct client insert/update to official prices, verification, roles, quote totals, or request transitions.
- Route origin/destination are not saved by default. Service pickup coordinates are permission/consent gated, accessible only for an active request, and purged after completion/cancellation and the approved complaint-retention window. The exact window is an open launch decision.
- Do not retain exact coordinates in logs, analytics, TTS cache keys, or crash reports. Avoid raw contact details in audit events.
- TrueCost/quote arithmetic and all state transitions run on the server/shared core. Amounts, discounts, provider eligibility, and completion claims from the browser are untrusted.

## 4. API contracts

All JSON APIs use schema validation on input, consistent `application/problem+json`-style errors, request IDs, safe logs, authentication where required, and rate limits. Never return secrets, private contact details, or exact location unless the authorized active workflow needs them.

**Error envelope**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted information.",
    "fieldErrors": { "quantityLitres": "Enter a number greater than zero." },
    "requestId": "..."
  }
}
```

| Method and path | Auth | Contract and rules |
|---|---|---|
| `GET /api/stations/nearby?lat=&lng=&areaId=&fuelType=&radiusKm=` | Optional | Require either valid coordinates or a known manual area; return stations with verification/demo flags, supported fuels, distance kind (`road`, `straight_line_approximate`), official national price reference, availability state, source, report time and freshness. Bound radius and result size. |
| `GET /api/stations/:id` | Optional | Station profile, provenance, supported fuels, sourced opening details, current official-price reference and availability/report history safe for public display. |
| `GET /api/fuel-prices/current?fuelType=` | Optional | Latest admin-entered national reference rate with effective date, source and entry time. No station-specific scraped rate. |
| `POST /api/routes/fuel-options` | Optional | Input: origin or manual area, destination, fuel type, quantity and optional vehicle economy/vehicle ID. Server computes candidates, route additions, TrueCost and reasons. On route failure return approximate distance with explicit label and no ETA. Rate-limited and do not persist precise route by default. |
| `POST /api/availability-reports` | Authenticated | Input: station, fuel type, report state, optional short note. Server sets reporter, source time, expiry and moderation; apply per-user/device rate limit and duplicate handling. Report never changes a price. |
| `GET /api/vehicles` / `POST /api/vehicles` / `PATCH /api/vehicles/:id` | Authenticated | Owner-scoped profile and economy; validate positive plausible km/L. |
| `POST /api/fuel-logs` / `GET /api/fuel-logs` | Authenticated | Owner-scoped litres, amount, vehicle, optional station/odometer. Validate odometer progression before deriving mileage. |
| `GET /api/providers/nearby?lat=&lng=&serviceType=` | Optional | Return approved, active providers only if the requested type and approved coverage match. No pending-provider leakage. |
| `POST /api/service-requests` | Authenticated | Supported service type, consented pickup location and minimum necessary vehicle/contact details. No fuel-delivery type. Only eligible approved providers can receive it. |
| `POST /api/provider/requests/:id/quote` | Approved provider | Accept the eligible provider offer and submit an itemized PKR quote; server assigns actor/provider and derives total from line items. |
| `POST /api/provider/requests/:id/decline` | Approved provider | Decline only that provider's eligible offer; record the response without exposing it to other users. |
| `POST /api/service-requests/:id/confirm-quote` | Request owner | Quote ID plus explicit confirmation; reject expired quote, cancelled request, changed amount, or ineligible provider. Confirmation is the dispatch/price consent boundary. |
| `POST /api/provider/requests/:id/status` | Assigned approved provider | Only legal transitions (`confirmed` → `en_route` → `completed`); append immutable request event. No provider can self-approve or mark another provider's work complete. |
| `GET /api/me/requests` / `GET /api/service-requests/:id` | Owner or assigned provider | Role-filtered history/status. Redact location/contact unless necessary for an active assignment. |
| `GET /api/admin/reports` / `POST /api/admin/...` | Admin | Moderation, station correction/verification, official price entry, provider approval and coverage summary; require audit event for every material change. |
| `POST /api/tts` | Optional, rate-limited | Dynamic non-sensitive text and locale only; allowlisted content classes/lengths, server-side cloud synthesis and cache. Never accept/read phone numbers or exact coordinates automatically. Fixed UI phrases use static audio first. |

Use safe status codes: 400 validation, 401 unauthenticated, 403 unauthorized, 404 not found or not visible, 409 stale/invalid transition, 429 rate-limited, 5xx integration/service failure. Avoid distinguishing another user's private record from a nonexistent one.

## 5. i18n, RTL, and voice

### Languages and layout

- Use **next-intl** with locale-prefixed routes and complete message catalogs: Urdu `ur` (default), English `en`, Roman Urdu `ur-Latn`, Punjabi Shahmukhi `pa-Arab`. Keep locale configuration/data-driven so adding a locale is a translation/catalog addition, not a component rewrite.
- First launch shows language names in their own script and a speaker control; remember the selection. Provide a persistent language control in settings.
- Use logical CSS properties (`margin-inline`, `padding-inline`, `text-align: start`) and document direction at the locale root. Mirror directional navigation icons only; do not mirror speaker, fuel, status, or other non-directional icons.
- Urdu/Shahmukhi use a bundled/optimized readable Arabic-script font with a Nastaliq/Naskh fallback evaluation (proposed Noto Naskh Arabic initially). Test line height, shaping, wrapping, and performance on low-end Android at 360px.
- Centralize localized number, PKR (`Rs`), date/time, and distance formatting. Offer Urdu digits as a setting; avoid mixing digit styles within one value.
- All UI copy, validation, accessibility labels, offline/error states and spoken strings come from translation files. Machine-written strings go into `docs/translation-review.md` marked **Machine draft — native speaker review required**, with reviewer/status fields. Do not claim a locale is pilot-ready until reviewed.

### TTS and speech input

Define a `TtsService.speak({ text, locale, contentKind })` abstraction with ordered fallback:

1. Small pre-recorded/pre-generated assets for fixed navigation, confirmations, status labels, and safety phrases, available offline.
2. Server-side cloud TTS for dynamic station/status/TrueCost/quote/request text, with locale-aware caching, output length caps, rate limits, timeouts and no private data. Pilot recommendation: evaluate **Azure Speech** first because it offers Urdu Pakistan (`ur-PK`) voices; compare intelligibility and dialect fit with Google Cloud TTS voices and browser support in a native-speaker listening test before enabling. Azure and Google both bill cloud synthesis by text/characters, with rates varying by voice/model tier; browser synthesis has no per-request cloud charge but unpredictable voice availability and quality. Fixed phrases incur a one-time recording/generation cost rather than a charge per play. Caching dynamic speech, keeping it short and setting a monthly character cap bound variable spend. Azure is recommended for locale fit, not because it is assumed to be the cheapest. Confirm exact current price, voice inventory and commercial terms in the README/service launch checklist.
3. Browser `speechSynthesis` last. Detect actual voices for the requested language; never assume Urdu or Shahmukhi exists. If unavailable, show a translated “Audio isn't available in this language on this device” message and keep the text accessible.

Every screen exposes a speaker button for key visible content; auto-read is off by default. Do not automatically speak phone numbers, exact coordinates, private contact data, or unconfirmed sensitive details. Voice input uses Web Speech API only when supported, with a visible typing/manual-area fallback and no loss of task completion.

**Provider references to re-check at implementation/launch:** [Azure Speech language and voice support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support), [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/), [Google Cloud TTS supported voices](https://cloud.google.com/text-to-speech/docs/voices), and [Google Cloud TTS pricing](https://cloud.google.com/text-to-speech/pricing). Prices and voice inventories can change.

## 6. UI/UX design

### Global rules

- Mobile-first, icon-first and voice-first. Tap targets are at least 56px; high contrast, readable type, short bilingual-friendly language, and one primary task per screen.
- Home has **exactly four** main actions: “Petrol Kidhar?”, “Sasta Scene”, “Madad Chahiye”, “Meri Gaari”. Each includes a large icon, short label, speaker action, and translated accessible name.
- Show a source and timestamp next to every price or availability claim, including demo state. Status always includes icon and word: green tick **Available**, grey question mark **Unknown**, orange clock **Stale**, red cross **Unavailable**. Queue reports include a clock icon and explicit “Queue reported” label; status must not rely on colour alone.
- 2D map/list toggle with a light initial map, bounded markers, clustering where useful, and no 3D. List remains usable when map tiles/routing are unavailable. Use skeletons, retryable offline/slow-network states, no heavy auto-loading geocoding.
- Request location only in context, explain why, and always provide manual area selection. Consent before sharing a pickup location with a provider. Prominent notice: **Chalo Yaar is not an emergency service**; contact local emergency services directly where needed.

### Screens and core flows

| Screen | Main content and interaction |
|---|---|
| First launch / language | Four large script-native language choices, speaker controls, continue; save preference. |
| Home | Four primary actions only, location/manual-area status, optional sign-in/settings entry. |
| Petrol Kidhar? | Permission or area picker → large fuel-type buttons → 2D map/list results → station detail → directions link. Cards show status/source/time, official national price/effective date, supported fuels, verification/demo flag, and approximate/road distance label. |
| Station detail | Name, sourced public details, status and age in words, price source/effective date, route/directions action, report action if signed in. No map pin implies stock/open status. |
| Sasta Scene | Select vehicle or economy → choose quantity on large number pad → compare a small set along a destination route → itemized purchase/detour/verified-discount result, assumptions and reason text. Missing economy means detour fuel component is “Unknown”; do not imply a complete TrueCost. |
| Report availability | Station and fuel prefilled → Available / Unavailable / Queue reported buttons → confirmation and report-time/moderation explanation. Do not expose reporter identity. |
| Meri Gaari | Vehicle list/add form → fuel log number pad → mileage and monthly spend only where enough valid data exists; explain estimates. |
| Madad Chahiye | Pick puncture/battery/towing → manual/GPS location and consent → vehicle/contact details only as needed → matching approved provider/quote lines → explicit “Request confirm kar dein?” → request status timeline. No fuel delivery. |
| Provider dashboard | Pending accounts see onboarding only. Approved provider sees eligible service requests, minimum necessary details, accept/decline/quote controls and legal status transitions. |
| Admin | Admin-only station correction/verification, national official price entry with source/date, report moderation/expiry, provider approval, demo-data management, audit trail and data-coverage gaps. |
| Settings/help | Language, Urdu digits, auto-read toggle, privacy/location consent, emergency disclaimer, offline state, account and sign-out. |

**Wireframe in words:** On a 360px phone, the home header is compact and RTL-aware; four vertically stacked, full-width icon cards occupy the main viewport. Each discovery screen starts with one question and a speaker button, then a large choice/control; results use readable cards above or alongside a collapsible map. Details and confirmations are separate screens/sheets so price, location-sharing consent and quote totals cannot be skipped. In Urdu, content order and controls mirror naturally without reversing numbers, status icons, or audio controls.

### Ranking and TrueCost presentation

1. Filter unsupported fuel and ineligible station/provider records.
2. Calculate route detour where possible; otherwise return labelled approximate distance and no ETA.
3. Calculate **purchase cost + additional detour fuel cost − verified redeemable discount** using server-known official national reference price and validated quantity/economy/offer rules.
4. Apply freshness/verification state and deterministic tie-breakers.
5. Return short reasons per option, e.g. “2.1 km extra route” and “report from 18 min ago”.

Do not call pump-price-only results “cheapest”; do not let a paid placement override verification, eligibility, or safety. All output is labelled an estimate and includes assumptions. Unknown economy, missing official price, invalid quantity, or unavailable route must produce a clear partial/validation state rather than a success-shaped invented total.

## 7. Milestones and browser-test checklists

Each milestone is implemented separately. At its end, run focused unit/integration checks, manually walk the browser checklist below, report local run steps and click path, update `docs/MOBILE-READINESS.md`, then **stop for your go-ahead** before beginning the next milestone.

### M1 — Foundation, i18n, and accessible shell

- [x] App starts locally; the manifest, service worker and localized PWA shell are configured and served.
- [x] First-launch language picker shows Urdu, English, Roman Urdu and Shahmukhi in their own scripts; selection survives reload.
- [x] Home shows only the four required main actions.
- [x] Check RTL and LTR at 360px, keyboard focus, 56px target sizes, font fallback and no horizontal overflow.
- [x] Unit-test fixed-recording → cloud → browser priority; simulate missing browser voice and verify translated fallback. Auto-read defaults off.
- [x] Localized offline shell has inline readable styling and a retry action; manual area selection belongs to M2's station-discovery flow.

The TTS adapter is wired in this milestone; actual fixed-phrase audio assets remain pending native-speaker recording/approval and are not synthesized or fabricated in the demo.

### M2 — Role-aware shell, dashboards and guest station browsing

- [ ] With configured OTP inboxes, sign in and verify driver/provider/admin accounts land at `/app`, `/provider` and `/admin` respectively.
- [x] Browse `/app/stations` and demo station detail without signing in at 360px in English and Urdu; location denial still permits manual area selection.
- [x] Verify logged-out `/app/help/new` redirects to sign-in with a return path and unauthenticated dashboard API access returns 401. Signed-in return and provider pending tests remain blocked on Supabase setup.
- [x] Unit-test logged-out, wrong-role and pending-provider decisions; authenticated browser role redirects await demo account setup.
- [ ] At 360px, verify the authenticated driver has exactly four bottom tabs and the same items in the desktop sidebar at 1024px or wider.
- [ ] With Supabase data, check driver dashboard ordering, speaker controls, skeleton/error/empty states, Unknown status, source/time and clearly labelled demo station data.
- [ ] With demo roles, check approved provider dashboard, pending/suspended provider wall, and admin overview counts/old-price warning without fake data.
- [x] Run `npm test` (13 tests), `npm run lint` and `npm run build`; seed scripts pass syntax checks.
- [ ] Apply reviewed migrations and seed demo account roles/stations in a configured Supabase project using local secrets.
- [ ] Update `docs/MOBILE-READINESS.md`; stop for approval before adding admin write tools, report workflows, mapping, TrueCost calculations or request internals.

Map tiles and route calculation are deliberately deferred in this milestone. Station details offer a labelled external directions link; no ETA is claimed.

### M3 — Admin, national official price, verification and corrections

- [ ] As admin, enter a national price with fuel type, source and effective date; view it as a user.
- [ ] Confirm one national rate is presented consistently and no station-specific scraped/crowdsourced price appears.
- [ ] Verify/correct a station and inspect its provenance/audit record.
- [ ] Confirm a non-admin cannot enter a price or change verification/demo status.

### M4 — Availability reports, expiry and moderation

- [ ] Submit a report while signed in; verify timestamp and pending/moderated display.
- [ ] Verify approved recent, expired and absent reports render as Available/Unavailable/Queue reported, Stale, and Unknown according to rules.
- [ ] Confirm report expiry, duplicate handling and rate limits.
- [ ] Confirm user identity is not exposed publicly and Unknown never becomes Unavailable.

### M5 — Route search, TrueCost and ranking

- [ ] Compare route candidates; inspect extra route distance, estimate assumptions, and deterministic reason strings.
- [ ] Test zero discount, long detour, missing km/L and invalid quantity through unit tests and UI states.
- [ ] Confirm only a verified, redeemable, in-date offer reduces the estimate.
- [ ] Force routing failure; see approximate straight-line fallback, no invented ETA, and clear uncertainty.
- [ ] Verify paid/demo ordering never defeats eligibility or verification.

### M6 — Meri Gaari and fuel log

- [ ] Create/edit only the signed-in user's vehicle; enter a valid refuel log.
- [ ] Reject negative/implausible quantity and odometer regression.
- [ ] Show km/L and monthly spend only when sufficient valid entries exist; empty state is plain-language and non-misleading.
- [ ] Confirm another account cannot read or change this data.

### M7 — Madad Chahiye, quotes and provider workflow

- [ ] Create puncture, battery and towing requests only; fuel delivery is absent.
- [ ] Confirm privacy/location consent before exact location sharing and see non-emergency disclaimer.
- [ ] Pending provider cannot see or accept requests; approved provider outside area/type cannot see them either.
- [ ] Eligible provider can accept with a line-item quote or decline; user sees quote total, terms/expiry, and must explicitly confirm before dispatch.
- [ ] Reject expired quotes, cancelled requests and invalid state transitions; track valid status changes in a timeline.
- [ ] Verify private contact/location is exposed only to the assigned, approved provider when needed.

### M8 — Polish, accessibility, and pilot readiness

- [ ] Exercise every locale at 360px and check RTL visual order, long translations, numbers, keyboard and contrast.
- [ ] Check list-only use with map/network failure, install flow, loading/empty/error states and low-end Android performance.
- [ ] Test voice fallback for every locale and ensure private data is not auto-read or cached.
- [ ] Review location consent/purge, rate limits, RLS, provider approval tests, privacy notice and emergency disclaimer.
- [ ] Confirm third-party data/service terms, attribution and costs before any external pilot.
- [ ] Produce an explicitly small, consented pilot report; do not claim representativeness or live accuracy beyond verified evidence.

## 8. Risks and open decisions

| Decision/risk | Plan recommendation | Must be settled before |
|---|---|---|
| Routing provider and terms/cost | Start behind `RoutingAdapter`; evaluate OpenRouteService for a bounded pilot, with straight-line labelled fallback. Self-host OSRM only if the team can operate it. Never use public demo routing endpoints as production. | Route milestone / deployment |
| Map tile provider | MapLibre renderer; select a commercial-use tile provider (MapTiler is a candidate) with production SLA/quotas reviewed. Public OSM tile servers are not the tile backend. | Discovery milestone |
| Geocoding and area list | Keep behind `GeocodingAdapter`; prefer a contracted provider or curated Faisalabad area list. Avoid depending on public Nominatim for production traffic. | Discovery milestone |
| Dynamic TTS | Azure Speech first for Urdu Pakistan voice evaluation; compare with Google and native-speaker review. Confirm voice availability, regional processing, terms and per-character cost; limit dynamic synthesis and use local fixed phrases. | Foundation/pilot |
| Urdu/Punjabi voice quality | Cloud catalog support is not a quality guarantee. Recruit native Urdu and Shahmukhi Punjabi listeners; browser fallback may not exist. | Before audio is described as supported |
| Pilot boundary and live operations | Propose a clearly bounded Faisalabad area and demo-labelled seed data first. Decide whether any provider flow is simulated or live; live requests require explicit operational approval. | Before provider milestone/field pilot |
| Provider due diligence | Define identity, coverage, authorization, pricing, cancellation, complaint path and suspension process; verify service providers before approval. | Before live requests |
| Location retention window | Default to no route-history storage and purge exact pickup location after request closure plus a user-approved complaint window. Select the actual window and disclose it. | Before live pilot |
| Official fuel-price source | Admin entry only from the chosen authoritative notified source, with date/source retained. Confirm source and permitted citation/reuse. | Before admin price entry |
| Station and OSM licensing | OSM attribution and ODbL obligations apply; review whether derived database distribution triggers share-alike duties. Validate the import boundary and keep source IDs/provenance. | Before importing/publishing data |
| Authentication | Supabase phone OTP or email; recommend email/test accounts for initial demo, then decide OTP/SMS costs and abuse controls before public pilot. Browsing stays anonymous. | Before auth-dependent live workflows |
| Funding/savings offers | Do not ship discounts unless a real partner, eligibility terms, redemption method and verified funding exist. With no eligible offer, discount is zero. | Before enabling discounts |
| Translation review | Machine-written catalog text must be reviewed by native speakers, especially safety, consent, price and service terms. | Before participant testing |
| Platform/privacy/legal | Confirm applicable Pakistan privacy, consumer, mapping, provider, emergency and fuel-service requirements with qualified local advice; this plan is not legal advice. | Before real-world service |
| Third-party service and license register | README will list Next.js, Supabase, MapLibre, selected tile/routing/geocoding/TTS providers, Overpass/OSM, fonts, and deployment/analytics (if any), with versions, licenses/terms, attribution, commercial-use status, quotas and links to verify. | Before deployment |

No analytics, advertising SDK, external AI model, or public location feed is planned for v1. If later proposed, it requires a privacy/consent and bundle/performance review first.

## 9. README and mobile-readiness deliverables

Implementation will add a root `README.md` with Windows-friendly and cross-platform local setup, required environment variables (names and purpose, no committed secrets), Supabase migration/seed steps, Overpass import instructions, tests, PWA run steps, deployment notes, and the complete third-party service/license/terms checklist.

At the end of every milestone, `docs/MOBILE-READINESS.md` will state:

- Which domain logic/contracts are reusable in React Native/Expo (especially `packages/core`).
- Which UI, storage, location, map and speech parts are web-specific and need native adapters.
- Any coupling or API gap to remove before a mobile client is practical.

## 10. Approval gate

This document is the complete planning deliverable for Step 1. **No application code, schema migration, or service integration has been created.** After approval, implementation starts at M1 only and pauses after every milestone for browser verification and your go-ahead.
