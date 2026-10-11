import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { numberInput } from "@/lib/driver-records";
export async function GET(request: NextRequest) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const lat = numberInput(request.nextUrl.searchParams.get("lat")),
    lng = numberInput(request.nextUrl.searchParams.get("lng"));
  const service = request.nextUrl.searchParams.get("service");
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (
    lat === null ||
    lng === null ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    !["puncture", "battery", "towing"].includes(service ?? "")
  )
    return reply(
      { error: { message: "Choose a service and a valid pickup location." } },
      400,
    );
  const { data, error } = await access.supabase
    .from("driver_service_quotes")
    .select(
      "id,provider_id,service_type,amount_pkr,pickup_latitude,pickup_longitude,verified_at,expires_at",
    )
    .eq("user_id", access.profile.id)
    .eq("service_type", service)
    .gte("pickup_latitude", lat - 0.001)
    .lte("pickup_latitude", lat + 0.001)
    .gte("pickup_longitude", lng - 0.001)
    .lte("pickup_longitude", lng + 0.001)
    .lte("verified_at", new Date().toISOString())
    .gt("expires_at", new Date().toISOString())
    .limit(10);
  if (error)
    return reply(
      {
        error: {
          message:
            "Verified quotes are temporarily unavailable. No request was sent.",
        },
      },
      503,
    );
  if (!data?.length)
    return reply({
      quotes: [],
      limitation:
        "No verified provider quote covers this pickup. No request was sent. You can preview a sample workflow.",
    });
  const providers = await access.supabase
    .from("providers")
    .select("id,active,verification_status,service_types,is_demo")
    .in(
      "id",
      data.map((quote) => quote.provider_id),
    );
  if (providers.error)
    return reply(
      { error: { message: "Provider verification is unavailable." } },
      503,
    );
  const quotes = data.filter((quote) =>
    providers.data?.some(
      (provider) =>
        provider.id === quote.provider_id &&
        provider.active &&
        provider.verification_status === "approved" &&
        !provider.is_demo &&
        provider.service_types.includes(service),
    ),
  );
  return reply({ quotes });
}
