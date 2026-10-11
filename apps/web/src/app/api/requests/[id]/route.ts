import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const { id } = await params;
  const { data, error } = await access.supabase
    .from("service_requests")
    .select("id,service_type,status,latitude,longitude,notes,created_at,updated_at,is_demo")
    .eq("id", id)
    .eq("user_id", access.profile.id)
    .maybeSingle();
  if (error) {
    console.error("Driver request lookup failed", error.message);
    return NextResponse.json({ error: { code: "REQUEST_QUERY_FAILED", message: "Request details are unavailable." } }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Request not found." } }, { status: 404 });
  return NextResponse.json({ request: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const { id } = await params;
  const { data, error } = await access.supabase.rpc("cancel_service_request", {
    target_request_id: id,
  });
  if (error) {
    console.error("Driver request cancellation failed", error.message);
    return NextResponse.json({ error: { code: "REQUEST_CANCEL_FAILED", message: "This request cannot be cancelled." } }, { status: 409 });
  }
  return NextResponse.json({ request: data }, { headers: { "Cache-Control": "no-store" } });
}
