import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/api-auth",()=>({requireApiRole:vi.fn()}));
vi.mock("@/lib/stations",()=>({getStationsAlongRoute:vi.fn()}));
vi.mock("@/lib/routing",()=>({getDrivingRoute:vi.fn()}));
import { requireApiRole } from "@/lib/api-auth";
import { getStationsAlongRoute } from "@/lib/stations";
import { getDrivingRoute } from "@/lib/routing";
import { POST } from "./route";

const input={originLatitude:31.4,originLongitude:73,destinationLatitude:31.5,destinationLongitude:73.1,litres:10,kmPerLitre:10,fuelType:"petrol"};
const candidate={id:"a",name:"QA fixture",brand:null,address:null,latitude:31.45,longitude:73.05,supportedFuels:["petrol" as const],verificationStatus:"unverified" as const,isDemo:false,source:"QA",sourceUrl:null,updatedAt:null,corridorDistanceKm:1,price:null};
const road={distanceKm:10,durationMinutes:10,source:"osrm" as const,geometry:{type:"LineString" as const,coordinates:[[73,31.4],[73.1,31.5]]}};
const request=(payload:unknown)=>new NextRequest("http://localhost/api/truecost",{method:"POST",body:JSON.stringify(payload),headers:{"Content-Type":"application/json"}});
beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(requireApiRole).mockResolvedValue({profile:{id:"qa"},supabase:{}} as never);
  vi.mocked(getStationsAlongRoute).mockResolvedValue([candidate]);
  vi.mocked(getDrivingRoute).mockResolvedValueOnce(road).mockResolvedValue({...road,distanceKm:12});
});
describe("Driver route API",()=>{
  it("ignores client-forged prices, discounts and routing summaries",async()=>{
    const response=await POST(request({...input,pricePerLitre:1,discount:100,offers:[{verified:true,eligible:true,amountPkr:999}],directDistanceKm:0}));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const data=await response.json();
    expect(data.stations[0]).toMatchObject({discount:0,price:null,totalCost:null,detourKm:2});
  });
  it("denies anonymous requests before calling providers",async()=>{
    vi.mocked(requireApiRole).mockResolvedValue({response:new Response(null,{status:401})} as never);
    expect((await POST(request(input))).status).toBe(401);expect(getDrivingRoute).not.toHaveBeenCalled();
  });
  it.each([[],{...input,fuelType:"cng"},{...input,originLatitude:91},{...input,litres:0},{...input,kmPerLitre:-1}])("rejects invalid input %j",async payload=>{
    expect((await POST(request(payload))).status).toBe(400);expect(getDrivingRoute).not.toHaveBeenCalled();
  });
  it("shows unavailable rather than synthetic detours when providers fail",async()=>{
    vi.mocked(getDrivingRoute).mockReset().mockResolvedValue(null);
    const data=await (await POST(request(input))).json();expect(data.status).toBe("route_unavailable");expect(data.stations).toEqual([]);
  });
  it("rejects a missing or foreign saved vehicle using an ownership predicate",async()=>{
    const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};
    vi.mocked(requireApiRole).mockResolvedValue({profile:{id:"qa"},supabase:{from:()=>query}} as never);
    expect((await POST(request({...input,vehicleId:"77777777-7777-4777-8777-777777777777"}))).status).toBe(400);
    expect(query.eq).toHaveBeenCalledWith("user_id","qa");expect(getDrivingRoute).not.toHaveBeenCalled();
  });
});
