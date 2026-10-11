import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

export async function GET() {
  const access = await requireApiRole("provider");
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase
    .from("service_requests")
    .select("id,service_type,status,latitude,longitude,notes,created_at,updated_at,is_demo,assigned_provider_id")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("Provider dashboard query failed", error.message);
    return NextResponse.json(
      { error: { code: "DASHBOARD_QUERY_FAILED", message: "Requests are temporarily unavailable." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { requests: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
