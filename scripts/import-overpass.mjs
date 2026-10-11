const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const overpassUrl = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.");
}

const query = `[out:json][timeout:60];
(
  node["amenity"="fuel"](31.30,72.95,31.55,73.25);
  way["amenity"="fuel"](31.30,72.95,31.55,73.25);
  relation["amenity"="fuel"](31.30,72.95,31.55,73.25);
);
out center tags;`;

const overpassResponse = await fetch(overpassUrl, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
  body: new URLSearchParams({ data: query }),
});
if (!overpassResponse.ok) {
  throw new Error(`Overpass request failed (${overpassResponse.status}): ${await overpassResponse.text()}`);
}

const osm = await overpassResponse.json();
if (!Array.isArray(osm.elements)) {
  throw new Error("Overpass returned an invalid response without an elements array.");
}

const rows = osm.elements.flatMap((element) => {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

  const tags = element.tags ?? {};
  const fuels = [];
  if (
    tags["fuel:octane_95"] === "yes"
    || tags["fuel:octane_98"] === "yes"
    || tags["fuel:petrol"] === "yes"
  ) fuels.push("petrol");
  if (tags["fuel:diesel"] === "yes") fuels.push("diesel");
  if (tags["fuel:cng"] === "yes") fuels.push("cng");

  const osmType = element.type;
  const osmId = element.id;
  return [{
    name: tags.name ?? tags.brand ?? `Fuel station (${osmType} ${osmId})`,
    brand: tags.brand ?? null,
    address: [tags["addr:street"], tags["addr:suburb"]].filter(Boolean).join(", ") || null,
    osm_type: osmType,
    osm_id: osmId,
    location: `SRID=4326;POINT(${longitude} ${latitude})`,
    supported_fuels: fuels,
    opening_info: tags.opening_hours ? { raw: tags.opening_hours } : null,
    source: "OpenStreetMap (Overpass)",
    source_url: `https://www.openstreetmap.org/${osmType}/${osmId}`,
    verification_status: "unverified",
    is_demo: false,
    updated_at: new Date().toISOString(),
  }];
});

if (rows.length === 0) {
  console.log("No stations found in the Faisalabad import area.");
  process.exit(0);
}

const response = await fetch(
  `${supabaseUrl.replace(/\/$/, "")}/rest/v1/stations?on_conflict=osm_type,osm_id`,
  {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  },
);

if (!response.ok) {
  throw new Error(`Supabase import failed (${response.status}): ${await response.text()}`);
}

console.log(`Imported/updated ${rows.length} OpenStreetMap stations.`);
