import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isAppRole, type AuthProfile, type ProviderVerification } from "./role-access";
import { getSupabaseConfig } from "./supabase-config";

export async function getSupabaseServerClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
            } catch (error) {
          console.error("Supabase session cookie refresh could not be persisted", error);
        }
      },
    },
  });
}

export async function getAuthenticatedUser() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Supabase session lookup failed", error.message);
    return null;
  }
  return data.user;
}

export async function getAuthProfile(): Promise<AuthProfile | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    if (authError) console.error("Supabase session lookup failed", authError.message);
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Supabase profile lookup failed", profileError.message);
    return null;
  }
  if (!profile || !isAppRole(profile.role)) {
    console.error("Authenticated user has no valid application role", authData.user.id);
    return null;
  }

  let verificationStatus: ProviderVerification | null = null;
  if (profile.role === "provider" || profile.role === "station_admin") {
    const verificationTable = profile.role === "provider" ? "providers" : "station_admins";
    const { data: verification, error: verificationError } = await supabase
      .from(verificationTable)
      .select("verification_status")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (verificationError) {
      console.error("Role verification lookup failed", verificationError.message);
      return null;
    }
    const status = verification?.verification_status;
    verificationStatus =
      status === "approved" || status === "suspended" ? status : "pending";
  }

  return {
    id: authData.user.id,
    role: profile.role,
    displayName: profile.display_name,
    verificationStatus,
  };
}
