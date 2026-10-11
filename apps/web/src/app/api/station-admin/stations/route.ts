import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

export async function GET() {
  const access = await requireApiRole("station_admin");
  if ("response" in access) return access.response;

  const { data, error } = await access.supabase
    .from("station_admin_assignments")
    .select("station_id, stations!inner(id,name,address,supported_fuels)")
    .eq("station_admin_id", access.profile.id)
    .order("created_at");
  if (error) {
    console.error("Station-admin assignments query failed", error.message);
    return NextResponse.json(
      { error: { code: "STATION_QUERY_FAILED", message: "Assigned stations could not be loaded." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ stations: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
