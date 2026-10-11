import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.");
}

const demoAccounts = [
  { env: "DEMO_DRIVER_EMAIL", role: "driver", name: "Demo Driver" },
  {
    env: "DEMO_APPROVED_PROVIDER_EMAIL",
    role: "provider",
    name: "Demo Approved Provider",
    verificationStatus: "approved",
  },
  {
    env: "DEMO_PENDING_PROVIDER_EMAIL",
    role: "provider",
    name: "Demo Pending Provider",
    verificationStatus: "pending",
  },
  { env: "DEMO_ADMIN_EMAIL", role: "admin", name: "Demo Admin" },
];

const missingEmails = demoAccounts
  .filter((account) => !process.env[account.env])
  .map((account) => account.env);
if (missingEmails.length) {
  throw new Error(`Set the demo inbox variables before seeding: ${missingEmails.join(", ")}`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not find existing demo users: ${error.message}`);
    const existing = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (existing) return existing;
    if (data.users.length < 1000) return null;
  }
}

for (const account of demoAccounts) {
  const email = process.env[account.env];
  const existing = await findUserByEmail(email);
  const result = existing
    ? await supabase.auth.admin.updateUserById(existing.id, {
        email,
        email_confirm: true,
        user_metadata: { display_name: account.name, is_demo: true },
      })
    : await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { display_name: account.name, is_demo: true },
      });
  if (result.error || !result.data.user) {
    throw new Error(`Could not seed ${account.role} account: ${result.error?.message ?? "user missing"}`);
  }

  const userId = result.data.user.id;
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      role: account.role,
      display_name: account.name,
      preferred_language: "ur",
      is_demo: true,
    },
    { onConflict: "id" },
  );
  if (profileError) throw new Error(`Could not seed demo profile: ${profileError.message}`);

  if (account.role === "provider") {
    const { error: providerError } = await supabase.from("providers").upsert(
      {
        id: userId,
        verification_status: account.verificationStatus,
        service_types: ["puncture", "battery", "towing"],
        active: account.verificationStatus === "approved",
        is_demo: true,
      },
      { onConflict: "id" },
    );
    if (providerError) throw new Error(`Could not seed demo provider: ${providerError.message}`);
  }

  console.log(`Seeded ${account.role} demo account: ${email}`);
}

console.log("Demo accounts are confirmed for email OTP. They and their provider records are marked as demo data.");
