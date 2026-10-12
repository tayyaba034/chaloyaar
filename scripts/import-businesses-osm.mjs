// Imports named Faisalabad service businesses from OpenStreetMap as UNCLAIMED listings.
// They start with availability UNKNOWN; hours are "published (OpenStreetMap)" only.
// Data © OpenStreetMap contributors (ODbL). Usage: node scripts/import-businesses-osm.mjs [--dry-run]
import { parseOsmOpeningHours } from "../supabase/functions/_shared/geo/osm-hours.ts";

const dryRun = process.argv.includes("--dry-run");
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!supabaseUrl || !serviceRoleKey)) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or pass --dry-run).");
const bbox = "31.30,72.95,31.55,73.25";
const query = `[out:json][timeout:120];
(
  nwr["shop"~"^(car_repair|tyres|car_parts|chemist|hardware|mobile_phone|electronics|supermarket|stationery|copyshop|laundry|dry_cleaning)$"]["name"](${bbox});
  nwr["amenity"~"^(pharmacy|clinic|doctors|dentist|car_wash|post_office|bank|townhall|courthouse)$"]["name"](${bbox});
  nwr["craft"~"^(car_repair|electrician|key_cutter)$"]["name"](${bbox});
  nwr["office"~"^(government|courier|company)$"]["name"](${bbox});
);
out center tags;`;

function category(tags) {
  if (tags.shop === "car_repair" || tags.craft === "car_repair") return "mechanic";
  if (tags.shop === "tyres" || tags.amenity === "car_wash" || tags.craft === "electrician") return "workshop";
  if (tags.amenity === "pharmacy" || tags.shop === "chemist") return "pharmacy";
  if (["clinic", "doctors", "dentist"].includes(tags.amenity)) return "clinic";
  if (tags.office || ["post_office", "bank", "townhall", "courthouse"].includes(tags.amenity)) return "office";
  if (["copyshop", "laundry", "dry_cleaning"].includes(tags.shop) || tags.craft === "key_cutter") return "other_service";
  return "shop";
}

const overpassUrls = [process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
async function fetchOverpass() {
  for (const url of overpassUrls) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ChaloYaar-business-import/1.0" },
        body: new URLSearchParams({ data: query }),
      }).catch(() => null);
      if (response?.ok) return response.json();
      console.warn(JSON.stringify({ event: "overpass_retry", url, attempt, status: response?.status ?? 0 }));
      await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
    }
  }
  throw new Error("Overpass is unavailable. Try again later.");
}

const osm = await fetchOverpass();
const rows = (osm.elements ?? []).flatMap((element) => {
  const tags = element.tags ?? {};
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  const name = (tags["name:en"] ?? tags.name ?? "").trim();
  if (!name || name.length < 2 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const phone = (tags.phone ?? tags["contact:phone"] ?? "").split(";")[0].trim();
  const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"]].filter(Boolean).join(", ");
  return [{
    business: {
      name: name.slice(0, 120), category: category(tags),
      latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)),
      phone: /^[+0-9 ()-]{7,30}$/.test(phone) ? phone : null,
      address: address ? address.slice(0, 300) : null,
      description: null, source: "osm_import", osm_type: element.type, osm_id: element.id,
      published_hours_text: tags.opening_hours ? String(tags.opening_hours).slice(0, 300) : null,
      listing_status: "unclaimed", is_demo: false,
    },
    hours: parseOsmOpeningHours(tags.opening_hours),
  }];
});
const byCategory = rows.reduce((counts, row) => ({ ...counts, [row.business.category]: (counts[row.business.category] ?? 0) + 1 }), {});
console.log(JSON.stringify({ event: "businesses_import_prepared", elements: osm.elements?.length ?? 0, rows: rows.length, withParsedHours: rows.filter((row) => row.hours?.length).length, byCategory }));
if (dryRun) process.exit(0);

const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
const base = supabaseUrl.replace(/\/$/, "");
let written = 0;
for (let start = 0; start < rows.length; start += 200) {
  const batch = rows.slice(start, start + 200);
  // Existing listings keep their status (a claimed business is never reset to unclaimed).
  const response = await fetch(`${base}/rest/v1/businesses?on_conflict=osm_type,osm_id&select=id,osm_type,osm_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(batch.map((row) => row.business)),
  });
  if (!response.ok) throw new Error(`Business import failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const inserted = await response.json();
  written += inserted.length;
  const hours = inserted.flatMap((business) => {
    const row = batch.find((item) => item.business.osm_type === business.osm_type && item.business.osm_id === business.osm_id);
    return (row?.hours ?? []).map((entry) => ({ business_id: business.id, weekday: entry.weekday, opens_at: entry.opensAt, closes_at: entry.closesAt, closes_next_day: entry.closesNextDay, source: "osm" }));
  });
  if (hours.length) {
    const hoursResponse = await fetch(`${base}/rest/v1/business_hours`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(hours) });
    if (!hoursResponse.ok) throw new Error(`Hours import failed (${hoursResponse.status}): ${(await hoursResponse.text()).slice(0, 300)}`);
  }
}
console.log(JSON.stringify({ event: "businesses_import_done", newListings: written }));
