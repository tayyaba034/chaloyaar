import { NextResponse } from "next/server";
import type { AppRole } from "./role-access";
import { getAuthProfile, getSupabaseServerClient } from "./supabase-server";

export async function requireApiRole(role: AppRole) {
  const profile = await getAuthProfile();
  if (!profile) {
    return {
      response: NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  if (profile.role !== role) {
    return {
      response: NextResponse.json(
        { error: { code: "FORBIDDEN", message: "You cannot access this information." } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  if ((role === "provider" || role === "station_admin") && profile.verificationStatus !== "approved") {
    return {
      response: NextResponse.json(
        { error: { code: "ROLE_NOT_APPROVED", message: "Account verification is pending." } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return {
      response: NextResponse.json(
        { error: { code: "SERVICE_NOT_CONFIGURED", message: "This service is not configured." } },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  return { profile, supabase } as const;
}
