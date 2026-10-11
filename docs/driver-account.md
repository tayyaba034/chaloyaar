# Driver Account MVP

The existing authenticated Driver area starts at `/en/app` (or the equivalent
supported language prefix). Drivers are redirected here after sign-in. Settings
is available only from the profile menu, at `/en/app/settings`.

## Routes and Storage

| Screen | Path | Data |
| --- | --- | --- |
| Home | `/app` | Signed-in profile, own vehicles/logs/requests, published station information |
| Find Petrol | `/app/stations` | Published station coordinates, approved non-demo reports and sourced prices |
| Save Money | `/app/truecost` | Own vehicle economy, server-selected prices and road routing when available |
| Get Help | `/app/help` | Own request history and server-issued verified quotes |
| My Car | `/app/vehicle` | Own saved vehicles with add/edit/delete |
| Fuel History | `/app/fuel-history` | Own refuelling records, vehicle/month filters, spending/mileage estimates |
| Profile | `/app/profile` | Own saved name; authenticated email/phone are read-only |
| Settings | `/app/settings` | Persisted language, read-aloud, in-app updates and reduced motion |

`/app/vehicle/log` remains a fuel-entry shortcut. `/en/demo/settings` is unchanged
and remains a separate sample preview, not the real Driver account.

## Honest Limitations

- Manual area lookup supports the three existing Faisalabad pilot areas. Station
  name/street search filters loaded results; there is no unrestricted geocoder.
- MapLibre uses the configured `NEXT_PUBLIC_MAPTILER_KEY`. Failed maps retain
  a station list, coordinates, and directions links. The supplied local key
  returned HTTP 403 during verification; its MapTiler permissions need checking.
- The existing 2D map is retained; a Cesium 3D experience is not implemented.
- `OPENROUTESERVICE_API_KEY` is server-only. `OSRM_BASE_URL` is optional; no public
  demo routing server is automatically used. Failed routes are consistently
  labelled straight-line approximations without ETAs.
- A sourced price is required for station comparison. The personal-figures
  calculator uses only the Driver's explicitly entered assumptions, not live
  prices. Eligible discount is zero: no verified offer integration exists.
- No quote-generation/coverage service is connected. Trusted operators/backends
  must issue `driver_service_quotes`; Drivers cannot create or alter them. Only
  their own unexpired, matching-pickup quotes from approved active non-demo
  providers can be submitted. Price and provider assignment are derived in the
  database. No quotes means no dispatch; the sample walkthrough never calls the
  request-submission API. Fuel delivery and promised arrival times are excluded.
- Notification controls cover in-app request updates only, not push or email.
- Mileage needs comparable refills between increasing odometer readings for
  the same vehicle. Initial refuelling and unassigned/deleted vehicles are excluded.
  Summaries cover the loaded records, not an unlimited account ledger.

## Verification

Run `npm test`, `npm run lint`, and `npm run build` in `apps/web`.

Run database ownership and quote lifecycle checks with:

```sh
supabase db query --linked --file supabase/tests/driver_account_access.sql
```

This test checks isolation for profiles, vehicles, fuel logs, quotes and requests,
role escalation prevention, foreign-vehicle rejection, unquoted-request rejection,
trusted quote derivation, and provider acceptance/status transitions. Its temporary
Auth users and records are rolled back.

Browser verification used the existing real Supabase test Driver at desktop
1440px and mobile 390px: sign-in to Home, seven-item navigation, vehicle and log
CRUD/confirmation, profile/settings persistence, profile menu, no-provider/sample
flows, filters, personal calculation, map failure fallback, and demo preview.
QA-created records were removed and the original profile preferences restored.

Three Driver migrations add owner-protected records/preferences and the quote
contract. The existing provider screen has only a small acceptance compatibility
change for a request assigned by a verified quote; its layout/settings are unchanged.
Admin and station-admin dashboards are unchanged. Keys remain in ignored local
environment configuration and are not tracked.
