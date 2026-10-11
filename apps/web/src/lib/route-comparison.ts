import { calculateEstimate, type Point } from "./truecost";
import type { FuelType, Station } from "./station-data";
import type { RouteEstimate } from "./routing";

export type RoutePrice = {
  amount: number; source: string; sourceUrl: string | null;
  effectiveAt: string; expiresAt: string; verifiedAt: string;
  stationId: string | null; isDemo: boolean;
};
export type TrustedOffer = {
  stationId: string; fuelType: FuelType; verified: boolean; eligible: boolean;
  amountPkr: number; minLitres: number; startsAt: string; expiresAt: string;
};
export type RouteCandidate = Station & { corridorDistanceKm: number; price: RoutePrice | null };
export type ComparisonInput = { origin: Point; destination: Point; litres: number; kmPerLitre: number | null; fuelType: FuelType };
export type RouteLookup = (origin: Point, destination: Point, via?: Point, provider?: RouteEstimate["source"]) => Promise<RouteEstimate | null>;

export function validPrice(price: RoutePrice | null, stationId: string, now: number): price is RoutePrice {
  return Boolean(price && !price.isDemo && price.source.trim() && Number.isFinite(price.amount) && price.amount > 0
    && (price.stationId === null || price.stationId === stationId)
    && Date.parse(price.effectiveAt) <= now && Date.parse(price.expiresAt) > now
    && Date.parse(price.verifiedAt) <= now);
}

export function eligibleDiscount(offer: TrustedOffer | null, stationId: string, input: ComparisonInput, now: number) {
  return offer && offer.verified && offer.eligible && offer.stationId === stationId && offer.fuelType === input.fuelType
    && Number.isFinite(offer.amountPkr) && offer.amountPkr > 0 && Number.isFinite(offer.minLitres) && offer.minLitres >= 0
    && input.litres >= offer.minLitres && Date.parse(offer.startsAt) <= now && Date.parse(offer.expiresAt) > now
    ? offer.amountPkr : 0;
}

export async function compareRoute(input: ComparisonInput, dependencies: {
  route: RouteLookup;
  candidates: (geometry: NonNullable<RouteEstimate["geometry"]>, fuel: FuelType) => Promise<RouteCandidate[]>;
  now?: () => number;
  // Trusted server data only. The current backend supplies no offers.
  offers?: TrustedOffer[];
}) {
  const direct = await dependencies.route(input.origin, input.destination);
  const usable = direct && Number.isFinite(direct.distanceKm) && direct.distanceKm >= 0 && direct.distanceKm <= 150 && direct.geometry;
  if (!usable) return { status: "route_unavailable" as const, direct: null, stations: [], ranking: "extra_distance" as const };
  const candidates = (await dependencies.candidates(direct.geometry!, input.fuelType))
    .filter(station => !station.isDemo && station.verificationStatus !== "rejected" && station.supportedFuels.includes(input.fuelType)).slice(0, 6);
  const options = [];
  // Bound provider concurrency to two requests, with at most six via routes.
  for (let start = 0; start < candidates.length; start += 2) {
    const batch = await Promise.all(candidates.slice(start, start + 2).map(async (station) => {
      const via = await dependencies.route(input.origin, input.destination, station, direct.source);
      const road = via && via.source === direct.source && Number.isFinite(via.distanceKm) && via.distanceKm >= direct.distanceKm && via.distanceKm <= 150;
      const now = (dependencies.now ?? Date.now)();
      const price = validPrice(station.price, station.id, now) ? station.price : null;
      const offer = dependencies.offers?.find(item => eligibleDiscount(item, station.id, input, now) > 0) ?? null;
      const discount = price ? Math.min(input.litres * price.amount, eligibleDiscount(offer, station.id, input, now)) : 0;
      const estimate = price ? calculateEstimate({ directDistanceKm: direct.distanceKm, viaStationDistanceKm: road ? via.distanceKm : direct.distanceKm, litres: input.litres, pricePerLitre: price.amount, kmPerLitre: road ? input.kmPerLitre : null }) : null;
      return {
        ...station, price, directDistanceKm: direct.distanceKm,
        viaStationDistanceKm: road ? via.distanceKm : null,
        detourKm: road ? via.distanceKm - direct.distanceKm : null,
        geometry: road ? via.geometry ?? null : null,
        routeAvailable: Boolean(road), discount,
        purchaseCost: estimate?.purchaseCost ?? null,
        detourFuelCost: road ? estimate?.detourFuelCost ?? null : null,
        totalCost: road && estimate?.totalCost != null ? Math.max(0, estimate.totalCost - discount) : null,
        explanations: [
          "near_route", price ? (price.stationId ? "station_price" : "reference_price") : "missing_price",
          ...(road ? [] : ["via_route_unavailable"]), ...(input.kmPerLitre === null ? ["missing_economy"] : []),
          discount > 0 ? "verified_offer" : "no_verified_offer",
          ...(station.verificationStatus === "verified" && station.verifiedAt ? [] : ["unverified_details"]),
        ],
      };
    }));
    options.push(...batch);
  }
  // Do not mix monetary totals and kilometres in one ranking.
  const completedAt = (dependencies.now ?? Date.now)();
  for (const option of options) {
    if (!validPrice(option.price, option.id, completedAt)) {
      option.price = null;
      option.purchaseCost = option.detourFuelCost = option.totalCost = null;
      option.discount = 0;
      option.explanations = option.explanations.filter(reason => !["reference_price", "station_price", "verified_offer", "no_verified_offer", "missing_price"].includes(reason));
      option.explanations.push("missing_price", "no_verified_offer");
    } else {
      const offer = dependencies.offers?.find(item => eligibleDiscount(item, option.id, input, completedAt) > 0) ?? null;
      const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
      option.discount = round(Math.min(input.litres * option.price!.amount, eligibleDiscount(offer, option.id, input, completedAt)));
      option.purchaseCost = round(option.purchaseCost!);
      if (option.detourFuelCost !== null) option.detourFuelCost = round(option.detourFuelCost);
      option.totalCost = option.detourFuelCost === null ? null : round(Math.max(0, option.purchaseCost + option.detourFuelCost - option.discount));
      option.explanations = option.explanations.filter(reason => !["verified_offer", "no_verified_offer"].includes(reason));
      option.explanations.push(option.discount > 0 ? "verified_offer" : "no_verified_offer");
    }
  }
  const ranking = options.length > 0 && options.every(option => option.totalCost !== null) ? "estimated_total" as const : "extra_distance" as const;
  options.sort((a, b) => (ranking === "estimated_total" ? a.totalCost! - b.totalCost! : (a.detourKm ?? Infinity) - (b.detourKm ?? Infinity)) || a.id.localeCompare(b.id));
  return {
    status: "ready" as const, direct, ranking,
    stations: options.map(option => ({ ...option, explanations: [...option.explanations, ranking === "estimated_total" ? "ranked_total" : "ranked_distance"] })),
  };
}

export type RouteComparison = Awaited<ReturnType<typeof compareRoute>>;
