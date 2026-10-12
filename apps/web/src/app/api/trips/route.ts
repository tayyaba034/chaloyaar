import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiReply, readJson, validationError } from "@/lib/api-errors";
import { dbError } from "@/lib/db-errors";
import { recentTrips, runWorkflow } from "@/lib/trip-workflow/service";
import { WorkflowConflict } from "@/lib/trip-workflow/types";
import { apiError } from "@/lib/api-errors";

export async function GET() {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const { data, error } = await recentTrips(access);
  if (error) return dbError(error, "trips_list_failed");
  return apiReply({ trips: data ?? [] });
}

const create = z.object({
  requestText: z.string().trim().min(3).max(1000),
  origin: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), label: z.string().trim().max(160) }).nullable().optional(),
  kmPerLitre: z.number().gt(0).max(200).nullable().optional(),
  pricePkrPerLitre: z.number().gt(0).max(5000).nullable().optional(),
  vehicleId: z.uuid().nullable().optional(),
});

// Creates a trip from a plain-language request and runs the planner until it needs the user.
export async function POST(request: Request) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const parsed = create.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const { data, error } = await access.supabase.from("itineraries").insert({
    user_id: access.profile.id,
    request_text: input.requestText,
    title: input.requestText.slice(0, 120),
    origin_label: input.origin?.label ?? null,
    origin_latitude: input.origin ? Number(input.origin.latitude.toFixed(6)) : null,
    origin_longitude: input.origin ? Number(input.origin.longitude.toFixed(6)) : null,
    km_per_litre: input.kmPerLitre ?? null,
    price_pkr_per_litre: input.pricePkrPerLitre ?? null,
    vehicle_id: input.vehicleId ?? null,
  }).select("id").single();
  if (error) return dbError(error, "trip_create_failed");
  try {
    const result = await runWorkflow(access, data.id, "user");
    return apiReply({ id: data.id, state: result.itinerary.workflowState }, 201);
  } catch (failure) {
    if (failure instanceof WorkflowConflict) return apiError("CONFLICT", failure.message, 409);
    return apiReply({ id: data.id, state: "FAILED" }, 201);
  }
}
