import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

export async function GET() {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase
    .from("availability_reports")
    .select("id,station_id,fuel_type,reported_status,reported_at,expires_at,is_demo,stations!inner(name,address)")
    .eq("moderation_status", "pending")
    .order("reported_at", { ascending: true })
    .limit(100);
  if (error) {
    console.error("Admin station reports query failed", error.message);
    return NextResponse.json({ error: { code: "REPORTS_QUERY_FAILED", message: "Reports are temporarily unavailable." } }, { status: 503 });
  }
  return NextResponse.json({ reports: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Send valid JSON." } }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  if (typeof payload.reportId !== "string" || (payload.status !== "approved" && payload.status !== "rejected")) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Choose a report and moderation action." } }, { status: 400 });
  }
  const { data, error } = await access.supabase.rpc("moderate_availability_report", {
    target_report_id: payload.reportId,
    target_status: payload.status,
  });
  if (error) {
    console.error("Admin station report moderation failed", error.message);
    return NextResponse.json({ error: { code: "MODERATION_FAILED", message: "That report is no longer pending." } }, { status: 409 });
  }
  return NextResponse.json({ report: data }, { headers: { "Cache-Control": "no-store" } });
}
