// Single source of truth for what is built, so progress can be checked in the app at /app/features.
// Update an entry in the same commit that finishes it.

export type FeatureStatus = "done" | "in_progress" | "planned";
export type FeatureTrack = "shared" | "trip_planner" | "station_intelligence";

export type FeatureEntry = {
  id: string;
  track: FeatureTrack;
  title: string;
  summary: string;
  status: FeatureStatus;
  commits?: string[];
  tryIt?: { href: string; label: string };
  howToCheck?: string[];
  needs?: string[];
};

export const featureRegistry: FeatureEntry[] = [
  {
    id: "S4-assistant",
    track: "shared",
    title: "Grounded station assistant (Gemini → Groq → basic)",
    summary: "Ask about nearby fuel in any app language. With a free Gemini or Groq key an agent calls the station search; without one a rule-based answer is used. Replies containing numbers that did not come from station data are discarded.",
    status: "done",
    commits: ["43a133c", "783fd4c", "fffa75c", "ba7f986"],
    tryIt: { href: "/app/stations", label: "Open Find Petrol" },
    howToCheck: [
      "Type “petrol near D-Ground” in the Ask Chalo Yaar panel.",
      "Check the answer lists stations with distance and availability.",
      "With an AI key set, the answer shows which provider wrote it.",
    ],
    needs: ["Optional: GEMINI_API_KEY and/or GROQ_API_KEY (server)"],
  },
  {
    id: "S4-map",
    track: "shared",
    title: "Persistent map with free tile fallback",
    summary: "The map is created once and updated in place. Tiles fall back MapTiler → OpenFreeMap (keyless, building heights) → OpenStreetMap.",
    status: "done",
    commits: ["cb2b3ad"],
    tryIt: { href: "/app/stations", label: "Open the station map" },
    howToCheck: [
      "Switch to Map view, then change the area: the map pans instead of reloading.",
      "Without a MapTiler key the map still loads using OpenFreeMap.",
    ],
  },
  {
    id: "S-sqltests",
    track: "shared",
    title: "Local database tests (PGlite)",
    summary: "All migrations and SQL tests run locally in WASM Postgres with PostGIS: npm run test:sql.",
    status: "done",
    commits: ["be00247"],
  },
  {
    id: "S-features",
    track: "shared",
    title: "Feature status page",
    summary: "This page: what is built, where to try it and what it needs.",
    status: "done",
    tryIt: { href: "/app/features", label: "You are here" },
  },
  {
    id: "S1",
    track: "shared",
    title: "Places gazetteer (free geocoding)",
    summary: "Search about 900 Faisalabad areas, roads, hospitals, offices and landmarks from OpenStreetMap by English, Urdu or Roman Urdu name.",
    status: "done",
    tryIt: { href: "/app/saved-places", label: "Search places" },
    howToCheck: [
      "Open My places and type “ghanta” or “susan” in Search the map.",
      "Results list the place type and, when you share location, the distance.",
    ],
    needs: ["Migration 20261012120000_shared_places_notifications applied", "Run: node scripts/import-places.mjs"],
  },
  {
    id: "S2",
    track: "shared",
    title: "In-app notifications",
    summary: "The bell shows notifications for confirmations, appointments and alerts; live with Supabase Realtime, otherwise refreshed every 30 seconds.",
    status: "done",
    tryIt: { href: "/app", label: "Open the bell (top right)" },
    howToCheck: ["Sign in as a driver and open the bell: Notifications appear above Request updates."],
    needs: ["Migration 20261012120000_shared_places_notifications applied"],
  },
  {
    id: "S3",
    track: "shared",
    title: "Validation, structured logging and setup notices",
    summary: "API input is checked with typed schemas; logs are JSON without personal data; a missing migration shows “Setup needed” with its name instead of a blank error.",
    status: "done",
    tryIt: { href: "/app/saved-places", label: "See a setup notice" },
    howToCheck: ["Before the migration is applied, My places explains which migration is missing."],
  },
  {
    id: "S5",
    track: "shared",
    title: "Saved places",
    summary: "Save home, work and other places from map search or GPS; private to you, up to 20.",
    status: "done",
    tryIt: { href: "/app/saved-places", label: "Open My places" },
    howToCheck: ["Add Home from search or GPS, then try adding a second Home (it is refused)."],
    needs: ["Migration 20261012120000_shared_places_notifications applied"],
  },

  { id: "B1", track: "trip_planner", title: "Trip planner data model", summary: "Businesses, services, hours, availability, confirmations, itineraries, trips and audit tables with business-level access control.", status: "planned", needs: ["Migration applied", "Demo businesses seeded"] },
  { id: "B2", track: "trip_planner", title: "Geo engine and itinerary solver", summary: "Fuel-cost maths, road or labelled straight-line distances, and stop-order optimisation with opening hours, deadlines and optional stops.", status: "planned" },
  { id: "B3", track: "trip_planner", title: "Geo Edge Function", summary: "The geo engine as a Supabase Edge Function, with an in-process fallback for local demos.", status: "planned", needs: ["Edge Function deployed (optional)"] },
  { id: "B4", track: "trip_planner", title: "Availability verification", summary: "Seven-state availability with sources, freshness, audit trail and confirmation requests.", status: "planned" },
  { id: "B5", track: "trip_planner", title: "Business portal", summary: "Business registration and dashboard for status, services, hours and customer requests.", status: "planned" },
  { id: "B6", track: "trip_planner", title: "Agentic trip workflow", summary: "Inspectable step-by-step planning that works without an LLM; optional AI tools need your approval for every consequential action.", status: "planned" },
  { id: "B7", track: "trip_planner", title: "Trip planner screens", summary: "Plan errands in plain language, compare original and optimised order on a map, and approve the plan.", status: "planned" },
  { id: "B8", track: "trip_planner", title: "Trips, outcomes and savings", summary: "Record what happened and see savings that are backed by your feedback.", status: "planned" },
  { id: "B9", track: "trip_planner", title: "Data foundations for future prediction", summary: "Consent-based outcome features and a predictor interface; no invented probabilities.", status: "planned" },
  { id: "B10", track: "trip_planner", title: "End-to-end tests and production guide", summary: "Browser tests of the whole planner flow and the path to production.", status: "planned" },

  { id: "A1", track: "station_intelligence", title: "Provider coverage and spatial data", summary: "Provider base location and radius, and request filtering by distance.", status: "planned", needs: ["Migration applied"] },
  { id: "A2", track: "station_intelligence", title: "Station assistant v2", summary: "Chat with voice input and more station tools.", status: "planned" },
  { id: "A3", track: "station_intelligence", title: "Spatial map layers", summary: "Report heat map, clustering, reachable area and admin coverage map.", status: "planned" },
  { id: "A4", track: "station_intelligence", title: "Station alerts and web push", summary: "Alerts when a watched station runs out.", status: "planned", needs: ["Edge Function deployed", "VAPID keys"] },
  { id: "A5", track: "station_intelligence", title: "MapLibre 3D view", summary: "Tilted map with 3D buildings and terrain, with 2D fallback.", status: "planned" },
  { id: "A6", track: "station_intelligence", title: "CesiumJS 3D showcase", summary: "Full 3D scene of the pilot area.", status: "planned" },
  { id: "A7", track: "station_intelligence", title: "Voice and offline", summary: "Recorded phrases and cached last search.", status: "planned" },
  { id: "A8", track: "station_intelligence", title: "Assistant evaluation", summary: "Golden-question tests in four languages.", status: "planned" },
];

export function registrySummary(entries: FeatureEntry[] = featureRegistry) {
  const count = (status: FeatureStatus) => entries.filter((entry) => entry.status === status).length;
  return { done: count("done"), inProgress: count("in_progress"), planned: count("planned"), total: entries.length };
}
