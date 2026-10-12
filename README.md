# Chalo Yaar

Mobile-first fuel discovery and roadside assistance for the Faisalabad pilot.

## Run locally

Requirements: Node.js 20.9 or later and npm.

```powershell
npm install
npm run dev
```

Open the local URL printed by Next.js. Choose Urdu, English, Roman Urdu or Punjabi Shahmukhi, then use the public landing page or sign in. Station list and detail pages are public at `/app/stations`; the driver dashboard and provider/admin workspaces require their matching role.

The roadside-help pilot flow is available for authenticated demo users after applying all migrations, including `202610110004_service_request_flow.sql`. Drivers can open `/app/help`, select puncture, battery or towing, and submit their current location with optional notes. Approved active providers see eligible unassigned requests in `/provider`, can claim or decline them, and can move claimed requests to “on the way” and “completed”. Drivers can track a request at `/app/help/[request-id]` and cancel it while it is still requested or confirmed. Map routing, quotes, payments, chat and admin request moderation remain outside this milestone.

## Environment variables

Create `apps/web/.env.local` for web sign-in and the public station service:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

The Supabase publishable key belongs in `NEXT_PUBLIC_SUPABASE_ANON_KEY`; it is the browser-safe key, not a service-role key. Apply the reviewed SQL migrations in `supabase/migrations/` to the intended Supabase project before enabling real user data.

Demo account and station seed scripts require server-side environment variables in the shell that runs them:

```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
$env:DEMO_DRIVER_EMAIL = "driver-inbox@example.com"
$env:DEMO_APPROVED_PROVIDER_EMAIL = "approved-provider-inbox@example.com"
$env:DEMO_PENDING_PROVIDER_EMAIL = "pending-provider-inbox@example.com"
$env:DEMO_ADMIN_EMAIL = "admin-inbox@example.com"
npm run demo:seed-users
npm run stations:seed-demo
```

Each seeded account is email-confirmed and can log in through the email OTP flow; the OTP goes to that account's inbox, so use inboxes you control and configure Supabase email delivery first. Provider status and all seeded records are marked as demo. The seed scripts are idempotent. Never put a service-role key or database password in a `NEXT_PUBLIC_*` variable, source file, or committed env file.

For password-based driver/admin demos, configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the local shell, then set `DEMO_DRIVER_PASSWORD` and `DEMO_ADMIN_PASSWORD` to different, strong, private values before running:

```powershell
npm run demo:seed-password-users
```

This seeds `driver@demo.com` as a driver and `admin@demo.com` as an admin, marks both profiles as demo, and sets email confirmation. The seeder rejects passwords shorter than 14 characters, email-matching passwords, and passwords shared between the accounts. Use the **Email and password** option on the sign-in page. Do not reuse credentials that have been posted in chat, and do not run a demo seed against production.

The Maps and route keys discussed during planning are not wired into this shell milestone. MapLibre/MapTiler tiles, routing, geocoding and TrueCost are deferred; any later ORS key must remain server-only, and any public tile key must be domain-restricted. Rotate credentials that have been pasted into chat before using the project.

## Station assistant (optional AI)

The “Ask Chalo Yaar” panel on `/app/stations` works without any AI key: it matches the fuel and area in the question and answers from the station search. Setting `GEMINI_API_KEY` and/or `GROQ_API_KEY` (server-only, both have free tiers) turns it into a tool-calling agent:

- Gemini decides when to call `find_stations` (the same PostGIS search and availability reports) or `roadside_help`, then writes the reply in the driver's language.
- The driver's coordinates stay on the server; Gemini only sees station names, rounded distances, availability and report times.
- Any reply containing a number that did not come from a tool result is discarded, and the basic answer is returned instead. Quota errors, timeouts and outages fall back the same way.
- `roadside_help` only shows a link to the help form. The agent cannot submit a request; the driver still reviews a provider quote and confirms it.
- Each client is limited to 8 questions per minute per server instance.

`GEMINI_MODEL` defaults to `gemini-flash-lite-latest`. An optional `GROQ_API_KEY` (free from the Groq console; `GROQ_MODEL` defaults to `llama-3.3-70b-versatile`) is tried when Gemini fails or is out of quota; an answer that fails the number check is not retried on another provider. Free-tier limits change and Google may use free-tier prompts to improve its products; check the current limits and terms in AI Studio before a pilot, and move to a paid key before public launch.

## Voice and current limits

Speaker controls try approved fixed-phrase audio first, then cloud TTS when configured, then a matching browser voice. No recordings or cloud TTS credentials are bundled in M1, so a device without a matching voice gets a translated explanation instead of fabricated speech.

`npm audit --omit=dev` previously reported no production dependency vulnerabilities. The full development dependency audit reported five high-severity transitive findings in the Next.js ESLint tooling chain; recheck with `npm audit` before deployment. Do not apply `npm audit fix --force` without reviewing its proposed major-version changes.

## Third-party services and terms to review

| Dependency/service | Purpose | License/terms to check |
|---|---|---|
| Next.js, React, Tailwind CSS, next-intl, Vitest | Web framework, styling, localization and tests | Package licenses and supported versions |
| Noto Naskh Arabic via Fontsource | Urdu/Shahmukhi-capable web font | SIL Open Font License (OFL); retain required notices |
| Supabase | Planned Auth, PostgreSQL and PostGIS | Service terms, data location, quotas and pricing before integration |
| MapLibre GL JS and selected tile provider | Deferred 2D map and tiles | Review the renderer license and provider's production/commercial terms, attribution, quotas and caching rules before adding it |
| OpenStreetMap / Overpass | Planned one-time station seed and map data | ODbL attribution/share-alike obligations and Overpass usage policy |
| Routing/geocoding provider | Planned server-side route/distance and area lookup | Provider terms, cost, rate limits, cache and location privacy rules |
| Azure Speech / Google Cloud TTS (decision pending) | Candidate dynamic speech provider | Current voice support, per-character pricing, data processing and commercial terms |
| Web Speech API | Optional browser speech fallback/input | Browser-specific voice availability and platform behavior |

Do not use public OSM tile servers or public demo routing endpoints as production infrastructure.

## Tests

```powershell
npm test
npm run lint
npm run build
```
