// Imports named Faisalabad places from OpenStreetMap (Overpass) into public.places, the free
// gazetteer used for place search and geocoding. Data © OpenStreetMap contributors (ODbL).
// Usage: node scripts/import-places.mjs [--dry-run]
const dryRun = process.argv.includes("--dry-run");
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const overpassUrl = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const bbox = "31.30,72.95,31.55,73.25";

if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing (or pass --dry-run).");
}

const query = `[out:json][timeout:120];
(
  node["place"~"^(suburb|neighbourhood|quarter|village|hamlet|locality)$"]["name"](${bbox});
  way["highway"~"^(trunk|primary|secondary|tertiary)$"]["name"](${bbox});
  nwr["amenity"~"^(hospital|clinic|doctors|school|college|university|marketplace|place_of_worship|townhall|courthouse|police|post_office|bus_station)$"]["name"](${bbox});
  nwr["shop"="mall"]["name"](${bbox});
  nwr["leisure"="park"]["name"](${bbox});
  nwr["tourism"="attraction"]["name"](${bbox});
  nwr["office"="government"]["name"](${bbox});
  nwr["railway"="station"]["name"](${bbox});
);
out center tags;`;

const arabicScript = /[؀-ۿ]/;

function placeKind(tags) {
  if (tags.place) return ["suburb", "quarter"].includes(tags.place) ? "area" : "neighbourhood";
  if (tags.highway) return "road";
  if (tags.amenity === "hospital") return "hospital";
  if (tags.amenity === "clinic" || tags.amenity === "doctors") return "clinic";
  if (["school", "college", "university"].includes(tags.amenity)) return "school";
  if (tags.amenity === "marketplace" || tags.shop === "mall") return "market";
  if (tags.amenity === "place_of_worship" && tags.religion === "muslim") return "mosque";
  if (["townhall", "courthouse", "police", "post_office"].includes(tags.amenity) || tags.office === "government") return "office";
  if (tags.leisure === "park") return "park";
  if (tags.amenity === "bus_station" || tags.railway === "station") return "transport";
  if (tags.tourism === "attraction") return "landmark";
  return "other";
}

function toPlaceRow(element) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  const tags = element.tags ?? {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !tags.name) return null;
  const urdu = tags["name:ur"] ?? (arabicScript.test(tags.name) ? tags.name : null);
  const english = tags["name:en"] ?? (arabicScript.test(tags.name) ? null : tags.name);
  if (!english && !urdu) return null;
  return {
    name_en: (english ?? urdu).slice(0, 160),
    name_ur: urdu ? urdu.slice(0, 160) : null,
    name_roman: tags["name:ur-Latn"]?.slice(0, 160) ?? null,
    kind: placeKind(tags),
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    source: "osm",
    osm_type: element.type,
    osm_id: element.id,
    is_demo: false,
    updated_at: new Date().toISOString(),
  };
}

// Roads are split into many ways with the same name; keep the first per name and kind.
function dedupeRoads(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (row.kind !== "road") return true;
    const key = row.name_en.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Overpass is shared public infrastructure: retry politely, then try a mirror.
const overpassUrls = [overpassUrl, "https://overpass.private.coffee/api/interpreter"];
async function fetchOverpass() {
  let lastError = "";
  for (const url of overpassUrls) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ChaloYaar-place-import/1.0" },
        body: new URLSearchParams({ data: query }),
      }).catch((error) => ({ ok: false, status: 0, text: async () => error.message }));
      if (response.ok) return response.json();
      lastError = `${url} -> ${response.status}`;
      console.warn(JSON.stringify({ event: "overpass_retry", url, attempt, status: response.status }));
      await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
    }
  }
  throw new Error(`Overpass request failed: ${lastError}`);
}

async function main() {
  const osm = await fetchOverpass();
  if (!Array.isArray(osm.elements)) throw new Error("Overpass returned no elements array.");
  const rows = dedupeRoads(osm.elements.map(toPlaceRow).filter(Boolean));
  const byKind = rows.reduce((counts, row) => ({ ...counts, [row.kind]: (counts[row.kind] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ event: "places_import_prepared", elements: osm.elements.length, rows: rows.length, byKind }));
  if (dryRun) {
    console.log(JSON.stringify({ event: "places_import_sample", sample: rows.slice(0, 5) }));
    return;
  }
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500);
    const write = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/places?on_conflict=osm_type,osm_id`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (!write.ok) throw new Error(`Supabase import failed (${write.status}): ${(await write.text()).slice(0, 300)}`);
  }
  console.log(JSON.stringify({ event: "places_import_done", rows: rows.length }));
}

await main();
