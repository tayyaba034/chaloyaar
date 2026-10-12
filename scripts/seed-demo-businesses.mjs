// Seeds unmistakably fictional DEMO businesses for the errand trip planner, plus an optional demo
// business-owner login so the confirmation flow can be tested end to end through the real UI.
// Every row is is_demo=true / source='demo'; the app labels them "Demo – not a real business".
// Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… [DEMO_BUSINESS_OWNER_PASSWORD=…] node scripts/seed-demo-businesses.mjs
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
const ownerEmail = "business-owner@demo.com";
const ownerPassword = process.env.DEMO_BUSINESS_OWNER_PASSWORD;
if (ownerPassword !== undefined && (ownerPassword.length < 14 || ownerPassword.toLowerCase().includes(ownerEmail))) {
  throw new Error("DEMO_BUSINESS_OWNER_PASSWORD must be at least 14 characters and must not contain the email.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

// Fictional names, fake phone numbers. Positions are spread around Faisalabad for routing realism.
const weekdays = (opens, closes, days = [1, 2, 3, 4, 5, 6]) => days.map((weekday) => ({ weekday, opens_at: opens, closes_at: closes }));
const demo = [
  { name: "[DEMO] Fictional ChillFix Car-AC Workshop", category: "workshop", lat: 31.4205, lng: 73.0895, services: [["Car AC repair", "car_ac", 60], ["AC gas refill", "car_ac_gas", 30]], hours: weekdays("09:00", "19:00") },
  { name: "[DEMO] Fictional Rapid Tyre & Tune Mechanic", category: "mechanic", lat: 31.4102, lng: 73.1068, services: [["Puncture repair", "puncture", 20], ["Engine tune-up", "tune_up", 90]], hours: weekdays("08:30", "20:00") },
  { name: "[DEMO] Fictional Canal View Auto Electric", category: "mechanic", lat: 31.4005, lng: 73.0702, services: [["Battery replacement", "battery", 30], ["Car AC repair", "car_ac", 75]], hours: weekdays("10:00", "18:00") },
  { name: "[DEMO] Fictional Shifa Care Pharmacy", category: "pharmacy", lat: 31.4168, lng: 73.0813, services: [["Prescription medicines", "prescription", 10]], hours: weekdays("08:00", "23:00", [0, 1, 2, 3, 4, 5, 6]) },
  { name: "[DEMO] Fictional Green Cross Pharmacy D-Ground", category: "pharmacy", lat: 31.4099, lng: 73.1131, services: [["Prescription medicines", "prescription", 10], ["Blood pressure check", "bp_check", 10]], hours: weekdays("09:00", "22:00") },
  { name: "[DEMO] Fictional Night Owl Pharmacy", category: "pharmacy", lat: 31.4251, lng: 73.0734, services: [["Prescription medicines", "prescription", 10]], hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens_at: "20:00", closes_at: "04:00", closes_next_day: true })) },
  { name: "[DEMO] Fictional Al-Noor Family Clinic", category: "clinic", lat: 31.4133, lng: 73.0941, services: [["General physician", "gp", 20], ["Dressing change", "dressing", 15]], hours: weekdays("10:00", "14:00").concat(weekdays("17:00", "21:00")) },
  { name: "[DEMO] Fictional Susan Road Dental Clinic", category: "clinic", lat: 31.4071, lng: 73.0918, services: [["Dental check-up", "dental", 30]], hours: weekdays("12:00", "20:00", [1, 2, 3, 4, 5]) },
  { name: "[DEMO] Fictional Citizen Documents Office", category: "office", lat: 31.4189, lng: 73.0779, services: [["Document collection", "document_collection", 15], ["Attestation", "attestation", 30]], hours: weekdays("09:00", "16:00", [1, 2, 3, 4, 5]) },
  { name: "[DEMO] Fictional Union Council Service Desk", category: "office", lat: 31.3989, lng: 73.0861, services: [["Certificate collection", "document_collection", 20]], hours: weekdays("09:00", "13:00", [1, 2, 3, 4, 5]) },
  { name: "[DEMO] Fictional Courier Pickup Point", category: "office", lat: 31.4227, lng: 73.1012, services: [["Parcel collection", "parcel", 10]], hours: weekdays("10:00", "20:00") },
  { name: "[DEMO] Fictional Spare Parts Bazaar Shop", category: "shop", lat: 31.4176, lng: 73.0857, services: [["Car spare parts", "spare_parts", 15]], hours: weekdays("10:00", "21:00") },
  { name: "[DEMO] Fictional Battery House", category: "shop", lat: 31.4058, lng: 73.0984, services: [["Car battery sale", "battery_sale", 15]], hours: weekdays("09:30", "20:30") },
  { name: "[DEMO] Fictional Quick Print & Photocopy", category: "other_service", lat: 31.4145, lng: 73.0756, services: [["Photocopy and print", "print", 10]], hours: weekdays("09:00", "21:00") },
  { name: "[DEMO] Fictional Laundry Express", category: "other_service", lat: 31.4239, lng: 73.0921, services: [["Laundry drop-off", "laundry", 10]], hours: weekdays("08:00", "20:00") },
];

async function findUserByEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not look up users: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
}

let ownerId = null;
if (ownerPassword) {
  const existing = await findUserByEmail(ownerEmail);
  const result = existing
    ? await supabase.auth.admin.updateUserById(existing.id, { password: ownerPassword, email_confirm: true, user_metadata: { display_name: "Demo Business Owner", is_demo: true } })
    : await supabase.auth.admin.createUser({ email: ownerEmail, password: ownerPassword, email_confirm: true, user_metadata: { display_name: "Demo Business Owner", is_demo: true } });
  if (result.error || !result.data.user) throw new Error(`Could not create the demo business owner: ${result.error?.message}`);
  ownerId = result.data.user.id;
  const { error } = await supabase.from("profiles").upsert({ id: ownerId, role: "driver", display_name: "Demo Business Owner", preferred_language: "ur", is_demo: true }, { onConflict: "id" });
  if (error) throw new Error(`Could not save the demo owner profile: ${error.message}`);
}

let created = 0;
for (const business of demo) {
  const { data: existing, error: findError } = await supabase.from("businesses").select("id").eq("name", business.name).eq("is_demo", true).maybeSingle();
  if (findError) throw new Error(`Could not check ${business.name}: ${findError.message}`);
  let id = existing?.id;
  if (!id) {
    const { data, error } = await supabase.from("businesses").insert({
      name: business.name, category: business.category, latitude: business.lat, longitude: business.lng,
      description: "Fictional demonstration listing. Not a real business.", phone: "+92 000 0000000",
      address: "Demonstration address (fictional), Faisalabad", source: "demo", is_demo: true, listing_status: "active",
    }).select("id").single();
    if (error) throw new Error(`Could not create ${business.name}: ${error.message}`);
    id = data.id;
    created += 1;
    const { error: serviceError } = await supabase.from("services").insert(business.services.map(([name, tag, duration]) => ({ business_id: id, name, tag, duration_minutes: duration })));
    if (serviceError) throw new Error(`Could not add services: ${serviceError.message}`);
    const { error: hoursError } = await supabase.from("business_hours").insert(business.hours.map((row) => ({ business_id: id, source: "demo", closes_next_day: false, ...row })));
    if (hoursError) throw new Error(`Could not add hours: ${hoursError.message}`);
  }
  if (ownerId) {
    const { error } = await supabase.from("business_users").upsert({ business_id: id, user_id: ownerId, role: "owner", status: "active" }, { onConflict: "business_id,user_id" });
    if (error) throw new Error(`Could not link the demo owner: ${error.message}`);
  }
}
console.log(JSON.stringify({ event: "demo_businesses_seeded", created, total: demo.length, demoOwner: ownerId ? ownerEmail : "not created (set DEMO_BUSINESS_OWNER_PASSWORD)" }));
console.log("Demo businesses are hidden unless the web server has SHOW_DEMO_BUSINESSES=true.");
