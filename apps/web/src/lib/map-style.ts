import type { StyleSpecification } from "maplibre-gl";
import { getMapTilerKey } from "./map-config";

export const openStreetMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    "openstreetmap-raster": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "openstreetmap-raster", type: "raster", source: "openstreetmap-raster" }],
};

// Free, keyless vector tiles with OSM building heights (used by the 3D view).
export const openFreeMapStyleUrl = "https://tiles.openfreemap.org/styles/liberty";

export type MapStyleOption = { id: "maptiler" | "openfreemap" | "osm"; style: string | StyleSpecification };

// Tried in order; the map moves to the next style when one fails to load.
export function mapStyleChain(mapTilerKey = getMapTilerKey()): MapStyleOption[] {
  return [
    ...(mapTilerKey
      ? [{ id: "maptiler" as const, style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(mapTilerKey)}` }]
      : []),
    { id: "openfreemap", style: openFreeMapStyleUrl },
    { id: "osm", style: openStreetMapStyle },
  ];
}
