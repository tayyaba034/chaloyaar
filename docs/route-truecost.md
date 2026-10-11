# Driver Route Comparison and TrueCost

Open `/en/app/truecost` after signing in as a Driver (Save Money in the existing sidebar). No new dashboard, routing provider or offer service was added.

## Implemented

- Optional current location or one of the existing manual starting areas. Type City Centre, Susan Road or D Ground as a pilot destination, or enter destination coordinates. General address geocoding is not connected.
- Existing OSRM/OpenRouteService configuration supplies a direct road route. Its geometry is used for a PostGIS corridor query, not an origin-only capped station collection.
- Up to six non-demo/non-rejected stations with recorded petrol/diesel metadata, within 2 km of the road route, are considered. Candidate selection favours geometric corridor proximity; it is bounded and not exhaustive. This geometric filter is not a road detour calculation or proof of fuel stock.
- Direct and via-station distances come from the same routing provider/profile. The via request is pinned to the direct provider; it cannot silently fall back to another service. Routes beyond the 150 km pilot limit, inconsistent shorter via distances, and failed routes are unavailable, not straight-line substitutes.
- Saved vehicles are looked up by authenticated owner. Saved economy takes precedence; manual economy can be used when no saved value exists. CNG is excluded until its pricing/economy units are settled.
- Itemized purchase, detour fuel cost, discount and estimated total. Monetary items are rounded consistently to two decimals. Missing economy yields purchase only. Missing/expired/unreviewed/demo prices yield no monetary total. A failed via route may retain a valid purchase estimate but never detour cost or total.
- Current station-specific prices take precedence over reference prices. Source, review time, effective time and expiry are shown. Reference prices are explicitly not pump confirmations.
- The backend has no verified offer integration and supplies no offers: discount is zero. The tested eligibility helper accepts trusted server data only; request-supplied prices, offers and discounts are ignored. This is not a new commercial-offer workflow.
- Sort by estimated total only when every option has a complete valid estimate; otherwise sort by added road distance, with unroutable stations last and deterministic ties. Reasons explain inclusion, reference pricing, unverified details, missing inputs and ranking.
- Select a station to view its available via-route geometry, open its existing detail page, or open station directions. Selection does not dispatch a service or guarantee stock.
- Inputs changing or price expiry invalidate the displayed comparison. Every new comparison rechecks database validity. A route failure offers the existing nearby finder, not a fabricated route estimate.
- The existing personal-figures calculator remains separate and clearly labelled. Its user-entered distance is an assumption, not a road-routing fallback.

## Database and Operations

Migration `supabase/migrations/20261011173445_route_station_comparison.sql` is applied and recorded in the existing linked project. It adds nullable expiry, review time and optional station scope to `fuel_prices`, plus a bounded security-invoker route-corridor RPC. Legacy prices are not automatically approved or assigned invented expiry dates. No search location/route history or cache table was added.

The existing admin price screen now requires a future expiry and explicit source/amount/date review. Optional station-specific entries require a verified station with matching fuel metadata. Reference entries remain reference data. Existing general price readers are restricted to reference rows so a station price cannot accidentally become an app-wide price.

No actual station fuels, verification statuses or prices were invented or populated. A named operator must verify station metadata and enter a genuinely supported dated price before currency comparison can be useful. A future scheduled price process and verified offers need separate approval.

Coordinates are sent to the configured server-side routing service. Keys stay on the server. API responses are private/no-store, queries do not persist locations, and failure logging avoids coordinates/provider secrets. The map service and external directions have separate privacy effects. At most six via requests run, two concurrently, following the base route. Hosting runtime limits, rate limits, quota/cost alerts and field-route quality still need operational review before a pilot.

PostGIS corridor queries use the existing spatial index and the approach in [Supabase's PostGIS documentation](https://supabase.com/docs/guides/database/extensions/postgis). The new RPC introduces no security-definer function. Existing unrelated database advisor warnings remain outside this phase.

## Verification and Current Limits

- Unit/API tests cover base/via distances, same-provider enforcement, inconsistent/failed routes, missing price/economy, discount eligibility, forged client data, ownership, expiry during requests, rounding and sorting/explanations.
- `supabase/tests/route_station_comparison.sql` uses rolled-back fixtures to check a station beyond the old origin radius, corridor/fuel/demo filters, price validity/scope preference and anonymous denial. The original station-discovery SQL tests remain available for regression testing.
- Desktop and 390/320 px browser checks cover destination/manual-origin entry, GPS denial, itemized/partial/unknown results, selection/details/directions, route failure and on-screen price expiry. Priced browser results are intercepted QA fixtures, not real station prices.
- A real signed-in Faisalabad request successfully obtained a road route and returned zero eligible stations. Current fuel metadata and reviewed prices are missing. This proves configured routing worked for that request, not general coverage, route safety, availability or uptime.
- The existing map service/worker fallback remains necessary; tile access is not fixed by this phase. The list and cost/distance results do not require tiles.
- New translations include provisional labels. Urdu/Punjabi wording and existing broader security/secret-rotation requirements need the review recorded in the main product plan before recruitment.

Run `npm test`, `npm run lint`, `npm run build` from the repository root. To repeat database fixtures against the intended test project: `supabase db query --linked --file supabase/tests/route_station_comparison.sql`. The fixtures roll back and must never be used as pilot data.
