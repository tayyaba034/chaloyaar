import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your local environment.");
}

const demoAccounts = [
  {
    email: "driver@demo.com",
    passwordVariable: "DEMO_DRIVER_PASSWORD",
    name: "Demo Driver",
    role: "driver",
  },
  {
    email: "admin@demo.com",
    passwordVariable: "DEMO_ADMIN_PASSWORD",
    name: "Demo Admin",
    role: "admin",
  },
];

for (const account of demoAccounts) {
  const password = process.env[account.passwordVariable];
  if (!password || password.length < 14 || password.toLowerCase().includes(account.email)) {
    throw new Error(
      `${account.passwordVariable} must be at least 14 characters and must not contain the account email.`,
    );
  }
}
if (process.env.DEMO_DRIVER_PASSWORD === process.env.DEMO_ADMIN_PASSWORD) {
  throw new Error("Use different passwords for the demo driver and admin accounts.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not look up demo account: ${error.message}`);
    const existing = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (existing) return existing;
    if (data.users.length < 1000) return null;
  }
}

for (const account of demoAccounts) {
  const password = process.env[account.passwordVariable];
  const existing = await findUserByEmail(account.email);
  const result = existing
    ? await supabase.auth.admin.updateUserById(existing.id, {
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: { display_name: account.name, is_demo: true },
      })
    : await supabase.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: { display_name: account.name, is_demo: true },
      });

  if (result.error || !result.data.user) {
    throw new Error(
      `Could not seed the demo ${account.role} account: ${result.error?.message ?? "user missing"}`,
    );
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: result.data.user.id,
      role: account.role,
      display_name: account.name,
      preferred_language: "ur",
      is_demo: true,
    },
    { onConflict: "id" },
  );
  if (profileError) {
    throw new Error(`Could not set demo ${account.role} profile: ${profileError.message}`);
  }

  console.log(`Seeded demo ${account.role} account ${account.email}.`);
}
