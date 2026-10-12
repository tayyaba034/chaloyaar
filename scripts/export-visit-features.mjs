// Exports consented, minimised visit features (no user id, no coordinates) to CSV for offline
// model research. Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/export-visit-features.mjs > features.csv
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
const columns = ["category", "weekday", "hour_bucket", "availability_state_at_departure", "confirmation_age_minutes", "confirmation_response_minutes", "service_ready", "prior_confirmed_visits", "prior_successful_visits", "outcome", "failure_cause", "created_at"];
const escape = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
process.stdout.write(`${columns.join(",")}\n`);
for (let offset = 0; ; offset += 1000) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/visit_feature_snapshots?select=${columns.join(",")}&order=created_at&offset=${offset}&limit=1000`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) throw new Error(`Export failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  const rows = await response.json();
  for (const row of rows) process.stdout.write(`${columns.map((column) => escape(row[column])).join(",")}\n`);
  if (rows.length < 1000) break;
}
