import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiRole("provider");
  if ("response" in access) return access.response;
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Send valid JSON." } }, { status: 400 });
  }
  const action = body && typeof body === "object" && "action" in body ? body.action : null;
  if (action !== "accept" && action !== "decline" && action !== "en_route" && action !== "completed") {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Choose a valid request action." } }, { status: 400 });
  }

  const rpc =
    action === "accept"
      ? access.supabase.rpc("claim_service_request", { target_request_id: id })
      : action === "decline"
        ? access.supabase.rpc("decline_service_request", { target_request_id: id })
        : access.supabase.rpc("transition_service_request", { target_request_id: id, target_status: action });
  const { data, error } = await rpc;
  if (error) {
    console.error("Provider request action failed", error.message);
    return NextResponse.json({ error: { code: "REQUEST_ACTION_FAILED", message: "That request action is no longer available." } }, { status: 409 });
  }
  return NextResponse.json({ request: data ?? null }, { headers: { "Cache-Control": "no-store" } });
}
