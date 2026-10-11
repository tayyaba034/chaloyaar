import { NextRequest, NextResponse } from "next/server";
import { getDiscoveryAvailability, getNearbyStations } from "@/lib/stations";
import { parseStationSearch, type StationSearch } from "@/lib/station-search";
import { discoveryFacts, matchesDiscoveryFuel } from "@/lib/station-discovery-facts";

const headers = { "Cache-Control": "private, no-store" };

async function search(input: Record<string, unknown>) {
  let query: StationSearch;
  try { query = parseStationSearch(input); }
  catch (error) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: (error as Error).message } }, { status: 400, headers });
  }
  try {
    // Also protect clients connected to the earlier RPC until the reviewed migration is applied.
    const stations = (await getNearbyStations(query)).filter(station => matchesDiscoveryFuel(station, query.fuelType));
    const facts = await getDiscoveryAvailability(stations.map((station) => station.id), query.fuelType ?? "petrol");
    return NextResponse.json({
      radiusKm: query.radiusKm,
      stations: stations.map((station) => ({
        ...station,
        availability: discoveryFacts(station, query.fuelType ?? "petrol", facts[station.id]),
      })),
    }, { headers });
  } catch {
    // Never log search coordinates or substitute sample stations for real results.
    return NextResponse.json({ error: { code: "STATIONS_UNAVAILABLE", message: "Stations are temporarily unavailable. Please retry." } }, { status: 503, headers });
  }
}

export async function GET(request: NextRequest) {
  return search(Object.fromEntries(request.nextUrl.searchParams));
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Send valid JSON." } }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Send a search object." } }, { status: 400, headers });
  }
  return search(body as Record<string, unknown>);
}
