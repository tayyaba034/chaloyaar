import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./supabase-config";

// Server-side client for public data (place search, business listings). Queries must still
// filter demo/private rows themselves, because local setups may only provide a service key.
export function getPublicSupabaseClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
