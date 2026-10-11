import { describe, expect, it, vi } from "vitest";
import { compareRoute, eligibleDiscount, validPrice, type RouteCandidate, type RoutePrice, type TrustedOffer } from "./route-comparison";
import type { RouteEstimate } from "./routing";

const now = Date.parse("2026-10-11T12:00:00Z");
const input = { origin: { latitude:31.4,longitude:73 }, destination:{latitude:31.5,longitude:73.1}, litres:20, kmPerLitre:10, fuelType:"petrol" as const };
const geometry = { type:"LineString" as const, coordinates:[[73,31.4],[73.1,31.5]] };
const direct: RouteEstimate = { distanceKm:10,durationMinutes:20,source:"osrm",geometry };
const price: RoutePrice = { amount:280,source:"QA reference",sourceUrl:null,effectiveAt:"2026-10-10T00:00:00Z",expiresAt:"2026-10-12T00:00:00Z",verifiedAt:"2026-10-11T10:00:00Z",stationId:null,isDemo:false };
const station = (id:string, p:RoutePrice|null=price):RouteCandidate => ({id,name:id,brand:null,address:null,latitude:31.45,longitude:73.05,supportedFuels:["petrol"],verificationStatus:"unverified",verifiedAt:null,isDemo:false,source:"QA",sourceUrl:null,updatedAt:null,corridorDistanceKm:1,price:p});
const offer: TrustedOffer = { stationId:"a",fuelType:"petrol",verified:true,eligible:true,amountPkr:100,minLitres:10,startsAt:"2026-10-10T00:00:00Z",expiresAt:"2026-10-12T00:00:00Z" };
function dependencies(candidates:RouteCandidate[],via:RouteEstimate|null={...direct,distanceKm:14}) {
  return {route:vi.fn().mockResolvedValueOnce(direct).mockResolvedValue(via),candidates:vi.fn().mockResolvedValue(candidates),now:()=>now};
}

describe("road-route comparison", () => {
  it("uses base and via road distances and an itemized calculation", async () => {
    const deps=dependencies([station("a")]);
    const result=await compareRoute(input,deps);
    expect(deps.route).toHaveBeenLastCalledWith(input.origin,input.destination,expect.objectContaining({id:"a"}),"osrm");
    expect(result.stations[0]).toMatchObject({detourKm:4,purchaseCost:5600,detourFuelCost:112,discount:0,totalCost:5712});
    expect(result.stations[0].explanations).toContain("reference_price");
  });
  it("returns purchase only without economy", async () => {
    const result=await compareRoute({...input,kmPerLitre:null},dependencies([station("a")]));
    expect(result.stations[0]).toMatchObject({purchaseCost:5600,detourFuelCost:null,totalCost:null,detourKm:4});
    expect(result.stations[0].explanations).toContain("missing_economy");
  });
  it("returns road distances but no fabricated costs without a price", async () => {
    const result=await compareRoute(input,dependencies([station("a",null)]));
    expect(result.stations[0]).toMatchObject({purchaseCost:null,totalCost:null,detourKm:4,discount:0});
    expect(result.stations[0].explanations).toContain("missing_price");
  });
  it("does not query candidates or fabricate a fallback when base routing fails", async () => {
    const deps=dependencies([station("a")]);deps.route.mockReset().mockResolvedValue(null);
    const result=await compareRoute(input,deps);
    expect(result).toMatchObject({status:"route_unavailable",direct:null,stations:[]});
    expect(deps.candidates).not.toHaveBeenCalled();
  });
  it("cannot select a route corridor without provider geometry", async () => {
    const deps=dependencies([station("a")]);deps.route.mockReset().mockResolvedValue({...direct,geometry:undefined});
    expect((await compareRoute(input,deps)).status).toBe("route_unavailable");
  });
  it.each([null,{...direct,source:"openrouteservice" as const},{...direct,distanceKm:9}])("never calculates a detour from a failed, mixed-provider or inconsistent via route", async via => {
    const result=await compareRoute(input,dependencies([station("a")],via));
    expect(result.stations[0]).toMatchObject({detourKm:null,detourFuelCost:null,totalCost:null,routeAvailable:false,purchaseCost:5600});
  });
  it("supports identical direct/via distance without invented extra fuel", async () => {
    expect((await compareRoute(input,dependencies([station("a")],direct))).stations[0].detourFuelCost).toBe(0);
  });
  it("sorts complete estimates by total, with deterministic ties and explanations", async () => {
    const result=await compareRoute(input,dependencies([station("b"),station("a")]));
    expect(result.ranking).toBe("estimated_total");expect(result.stations.map(s=>s.id)).toEqual(["a","b"]);
    expect(result.stations[0].explanations).toContain("ranked_total");
  });
  it("sorts mixed missing-price results by added distance, not currency mixed with km", async () => {
    const deps=dependencies([station("a"),station("b",null)]);
    deps.route.mockReset().mockResolvedValueOnce(direct).mockResolvedValueOnce({...direct,distanceKm:14}).mockResolvedValueOnce({...direct,distanceKm:12});
    const result=await compareRoute(input,deps);
    expect(result.ranking).toBe("extra_distance");expect(result.stations.map(s=>s.id)).toEqual(["b","a"]);
    expect(result.stations[0].explanations).toContain("ranked_distance");
  });
  it("applies only a trusted verified eligible offer", async () => {
    const result=await compareRoute(input,{...dependencies([station("a")]),offers:[offer]});
    expect(result.stations[0]).toMatchObject({discount:100,totalCost:5612});
    expect(result.stations[0].explanations).toContain("verified_offer");
  });
  it("excludes demo, rejected and unknown-fuel candidates", async () => {
    const result=await compareRoute(input,dependencies([{...station("a"),isDemo:true},{...station("b"),verificationStatus:"rejected"},{...station("c"),supportedFuels:[]}]));
    expect(result.stations).toEqual([]);
  });
  it("checks price validity again when routing finishes", async () => {
    const deps=dependencies([station("a")]);let calls=0;
    const result=await compareRoute(input,{...deps,now:()=>++calls===1?now:Date.parse(price.expiresAt)});
    expect(result.stations[0].totalCost).toBeNull();expect(result.stations[0].price).toBeNull();
  });
  it("uses rounded itemized values consistently", async () => {
    const result=await compareRoute({...input,litres:1.234,kmPerLitre:13},dependencies([station("a",{...price,amount:280.23})]));
    const row=result.stations[0];
    expect(row.totalCost).toBe(Number((row.purchaseCost!+row.detourFuelCost!).toFixed(2)));
  });
  it("removes an offer that expires while routing finishes", async () => {
    let calls=0;
    const result=await compareRoute(input,{...dependencies([station("a")]),offers:[{...offer,expiresAt:"2026-10-11T12:00:01Z"}],now:()=>++calls===1?now:now+2000});
    expect(result.stations[0].discount).toBe(0);expect(result.stations[0].totalCost).toBe(5712);
  });
});
describe("sourced price and offer validity",()=>{
  it.each([{isDemo:true},{expiresAt:"2026-10-11T12:00:00Z"},{expiresAt:"invalid"},{verifiedAt:""},{effectiveAt:"2026-10-12T00:00:00Z"},{stationId:"other"},{amount:NaN},{source:" "}])("rejects invalid price %j",change=>expect(validPrice({...price,...change},"a",now)).toBe(false));
  it.each([{verified:false},{eligible:false},{stationId:"other"},{fuelType:"diesel" as const},{minLitres:100},{expiresAt:"2026-10-11T12:00:00Z"},{amountPkr:Infinity},{startsAt:"invalid"}])("applies zero to ineligible offer %j",change=>expect(eligibleDiscount({...offer,...change},"a",input,now)).toBe(0));
});
