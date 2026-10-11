"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./supabase-config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  browserClient ??= createBrowserClient(url, key);
  return browserClient;
}
