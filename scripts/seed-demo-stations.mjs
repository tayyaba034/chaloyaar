const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.");
}

const samples = [
  { name: "Demo station — City Centre", latitude: 31.4181, longitude: 73.0791, supported_fuels: ["petrol", "diesel"] },
  { name: "Demo station — Susan Road", latitude: 31.4077, longitude: 73.0912, supported_fuels: ["petrol"] },
  { name: "Demo station — D-Ground", latitude: 31.4093, longitude: 73.112, supported_fuels: ["petrol", "diesel", "cng"] },
];

const rows = samples.map((sample, index) => ({
  name: sample.name,
  address: "Sample location, Faisalabad",
  osm_type: "demo",
  osm_id: index + 1,
  location: `SRID=4326;POINT(${sample.longitude} ${sample.latitude})`,
  supported_fuels: sample.supported_fuels,
  source: "Demo data",
  verification_status: "unverified",
  is_demo: true,
  updated_at: new Date().toISOString(),
}));

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
  throw new Error(`Demo seed failed (${response.status}): ${await response.text()}`);
}

console.log(`Seeded ${rows.length} clearly labelled demo stations.`);
