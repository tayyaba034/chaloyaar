import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { isUuid, validateVehicle } from "@/lib/driver-records";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET() {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase
    .from("driver_vehicles")
    .select("id,nickname,vehicle_type,fuel_type,estimated_km_per_litre")
    .eq("user_id", access.profile.id)
    .order("created_at");
  return error
    ? reply(
        {
          error: {
            message:
              "Vehicles are unavailable. Check the Driver migration and try again.",
          },
        },
        503,
      )
    : reply({ vehicles: data ?? [] });
}
export async function POST(request: NextRequest) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const payload = await request.json().catch(() => null);
  const vehicle =
    payload && typeof payload === "object" ? validateVehicle(payload) : null;
  if (!vehicle)
    return reply(
      {
        error: {
          message:
            "Enter a nickname, supported vehicle/fuel type and optional economy between 0 and 200 km/L.",
        },
      },
      400,
    );
  const query = payload.id
    ? access.supabase
        .from("driver_vehicles")
        .update({ ...vehicle, updated_at: new Date().toISOString() })
        .eq("id", payload.id)
        .eq("user_id", access.profile.id)
    : access.supabase
        .from("driver_vehicles")
        .insert({ ...vehicle, user_id: access.profile.id });
  if (payload.id && !isUuid(payload.id))
    return reply({ error: { message: "Invalid vehicle." } }, 400);
  const { data, error } = await query
    .select("id,nickname,vehicle_type,fuel_type,estimated_km_per_litre")
    .maybeSingle();
  if (error)
    return reply({ error: { message: "Vehicle could not be saved." } }, 503);
  return data
    ? reply({ vehicle: data }, payload.id ? 200 : 201)
    : reply({ error: { message: "Vehicle not found." } }, 404);
}
export async function DELETE(request: NextRequest) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const id = request.nextUrl.searchParams.get("id");
  if (!isUuid(id))
    return reply({ error: { message: "Invalid vehicle." } }, 400);
  const { data, error } = await access.supabase
    .from("driver_vehicles")
    .delete()
    .eq("id", id)
    .eq("user_id", access.profile.id)
    .select("id")
    .maybeSingle();
  return error
    ? reply({ error: { message: "Vehicle could not be removed." } }, 503)
    : data
      ? reply({ removed: true })
      : reply({ error: { message: "Vehicle not found." } }, 404);
}
