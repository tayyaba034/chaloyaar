import { faisalabadBounds, parseCoordinateText } from "./validate.ts";
import type { FetchFn, LatLng } from "./types.ts";

export type GeocodeSource = "coordinates" | "gazetteer" | "nominatim";
export type GeocodeCandidate = LatLng & { label: string; source: GeocodeSource; placeId?: string; kind?: string };
export type GeocodeOutcome = {
  candidates: GeocodeCandidate[];
  // Providers that could not answer, so the UI can say why results are thin.
  unavailable: Array<{ source: GeocodeSource; reason: "not_configured" | "error" | "rate_limited" }>;
};

export type GazetteerSearch = (query: string, near: LatLng | null) => Promise<Array<{ id: string; nameEn: string; kind: string; latitude: number; longitude: number }>>;

export type GeocodeConfig = {
  gazetteer?: GazetteerSearch | null;
  // Optional: public Nominatim requires a contact email and at most one request per second.
  nominatimBaseUrl?: string | null;
  nominatimContactEmail?: string | null;
  fetchFn?: FetchFn;
  now?: () => number;
};

let lastNominatimCall = 0;

/**
 * Typed coordinates first, then the free OSM gazetteer, then Nominatim if configured.
 * Never invents a location: an empty candidate list means "not found".
 */
export async function geocode(query: string, near: LatLng | null, config: GeocodeConfig = {}): Promise<GeocodeOutcome> {
  const text = query.trim();
  const unavailable: GeocodeOutcome["unavailable"] = [];
  if (text.length < 2 || text.length > 160) return { candidates: [], unavailable };
  const typed = parseCoordinateText(text);
  if (typed) return { candidates: [{ ...typed, label: `${typed.latitude.toFixed(5)}, ${typed.longitude.toFixed(5)}`, source: "coordinates" }], unavailable };

  if (config.gazetteer) {
    try {
      const places = await config.gazetteer(text, near);
      if (places.length) {
        return {
          candidates: places.map((place) => ({ latitude: place.latitude, longitude: place.longitude, label: place.nameEn, source: "gazetteer", placeId: place.id, kind: place.kind })),
          unavailable,
        };
      }
    } catch {
      unavailable.push({ source: "gazetteer", reason: "error" });
    }
  } else {
    unavailable.push({ source: "gazetteer", reason: "not_configured" });
  }

  if (!config.nominatimBaseUrl || !config.nominatimContactEmail) {
    unavailable.push({ source: "nominatim", reason: "not_configured" });
    return { candidates: [], unavailable };
  }
  const now = config.now ?? (() => Date.now());
  if (now() - lastNominatimCall < 1000) {
    unavailable.push({ source: "nominatim", reason: "rate_limited" });
    return { candidates: [], unavailable };
  }
  lastNominatimCall = now();
  const url = new URL(`${config.nominatimBaseUrl.replace(/\/$/, "")}/search`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", text);
  url.searchParams.set("countrycodes", "pk");
  url.searchParams.set("limit", "5");
  url.searchParams.set("email", config.nominatimContactEmail);
  url.searchParams.set("viewbox", `${faisalabadBounds.west},${faisalabadBounds.north},${faisalabadBounds.east},${faisalabadBounds.south}`);
  try {
    const fetchFn = config.fetchFn ?? ((input, init) => fetch(input, init));
    const response = await fetchFn(url.toString(), { headers: { Accept: "application/json", "User-Agent": `ChaloYaar/1.0 (${config.nominatimContactEmail})` } });
    if (!response.ok) {
      unavailable.push({ source: "nominatim", reason: response.status === 429 ? "rate_limited" : "error" });
      return { candidates: [], unavailable };
    }
    const rows = await response.json() as Array<{ lat?: string; lon?: string; display_name?: string; type?: string }>;
    const candidates = (Array.isArray(rows) ? rows : []).flatMap((row) => {
      const latitude = Number(row.lat);
      const longitude = Number(row.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || typeof row.display_name !== "string") return [];
      return [{ latitude, longitude, label: row.display_name.slice(0, 200), source: "nominatim" as const, kind: row.type }];
    });
    return { candidates, unavailable };
  } catch {
    unavailable.push({ source: "nominatim", reason: "error" });
    return { candidates: [], unavailable };
  }
}
