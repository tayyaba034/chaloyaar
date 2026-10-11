import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

export async function GET() {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  const [reports, providers, complaints, price] = await Promise.all([
    access.supabase
      .from("availability_reports")
      .select("id", { count: "exact", head: true })
      .eq("moderation_status", "pending"),
    access.supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("verification_status", "pending"),
    access.supabase
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    access.supabase
      .from("fuel_prices")
      .select("effective_at,entered_at,is_demo")
      .eq("fuel_type", "petrol")
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const failed = [reports, providers, complaints, price].find((result) => result.error);
  if (failed?.error) {
    console.error("Admin dashboard query failed", failed.error.message);
    return NextResponse.json(
      { error: { code: "DASHBOARD_QUERY_FAILED", message: "Overview information is temporarily unavailable." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    {
      newReports: reports.count ?? 0,
      pendingProviders: providers.count ?? 0,
      openComplaints: complaints.count ?? 0,
      lastPrice: price.data
        ? {
            ...price.data,
            isOld:
              Date.now() - new Date(price.data.effective_at).getTime() >
              30 * 24 * 60 * 60 * 1000,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
