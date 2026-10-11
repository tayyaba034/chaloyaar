import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
export async function GET() {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase
    .from("station_public")
    .select("id,name,address,is_demo")
    .order("name")
    .limit(100);
  return NextResponse.json(
    error
      ? {
          error: {
            message:
              "Station choices are unavailable. You can leave the station unknown.",
          },
        }
      : { stations: data ?? [] },
    {
      status: error ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
