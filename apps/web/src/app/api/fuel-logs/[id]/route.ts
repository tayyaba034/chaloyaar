import { NextRequest,NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { isUuid } from "@/lib/driver-records";
export async function DELETE(_request:NextRequest,{ params }:{ params:Promise<{ id:string }> }) {
  const access = await requireApiRole("driver"); if ("response" in access) return access.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error:{ message:"Invalid record." } },{ status:400 });
  const { data,error } = await access.supabase.from("fuel_logs").delete().eq("id",id).eq("user_id",access.profile.id).select("id").maybeSingle();
  return NextResponse.json(error ? { error:{ message:"Record could not be removed." } } : data ? { removed:true } : { error:{ message:"Record not found." } },{ status:error ? 503 : data ? 200 : 404,headers:{ "Cache-Control":"no-store" } });
}
