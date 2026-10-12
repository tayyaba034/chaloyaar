"use client";
import { useEffect, useRef, useState } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  Popup,
  LngLatBounds,
  getVersion,
  setWorkerUrl,
} from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleChain } from "@/lib/map-style";
type StationMarker = {
  name: string;
  latitude: number;
  longitude: number;
  warning?: string;
  address?: string | null;
};
type Geometry = { type: "LineString"; coordinates: number[][] };
type Coordinates = { latitude: number; longitude: number };

export type HexLayer = {
  data: { type: "FeatureCollection"; features: unknown[] };
  property: string;
  max: number;
  color: "olive" | "rust";
};

const hexColors = { olive: ["#e4ecd8", "#42735b"], rust: ["#f6e2d3", "#ac4d30"] } as const;

// Approximate circle (64 points) for a straight-line search radius.
function circlePolygon(center: Coordinates, radiusKm: number) {
  const coordinates = Array.from({ length: 65 }, (_, index) => {
    const angle = (index / 64) * 2 * Math.PI;
    return [
      center.longitude + (radiusKm / (111.32 * Math.cos((center.latitude * Math.PI) / 180))) * Math.cos(angle),
      center.latitude + (radiusKm / 111.32) * Math.sin(angle),
    ];
  });
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coordinates] } };
}

export function TrueCostMap({
  markers,
  routeGeometry,
  center,
  userLocation,
  hexLayer,
  threeD = false,
  radius,
  routeDashed = false,
}: {
  markers: StationMarker[];
  routeGeometry?: Geometry | null;
  center?: Coordinates;
  userLocation?: Coordinates | null;
  hexLayer?: HexLayer | null;
  threeD?: boolean;
  radius?: { center: Coordinates; km: number } | null;
  // Dashed lines mark straight-line connections that are not driving directions.
  routeDashed?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const startRef = useRef<Coordinates | undefined>(center ?? markers[0]);
  const [styleVersion, setStyleVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const hasContent = markers.length > 0 || Boolean(center);
  useEffect(() => {
    startRef.current = center ?? markers[0];
  }, [center, markers]);

  // Create the map once; data changes below update it in place.
  useEffect(() => {
    const start = startRef.current;
    if (!container.current || !hasContent || !start) return;
    const styles = mapStyleChain();
    let styleIndex = 0;
    let ready = false;
    let active = true;
    let map: Map | undefined;
    const timer = window.setTimeout(() => {
      if (active && !ready) setFailed(true);
    }, 18000);
    try {
      setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);
      map = new Map({
        container: container.current,
        style: styles[0].style,
        center: [start.longitude, start.latitude],
        zoom: 12,
        cooperativeGestures: true,
      });
      mapRef.current = map;
      map.addControl(new NavigationControl(), "top-right");
      map.on("error", (event) => {
        if (!active) return;
        const status = (event.error as Error & { status?: number }).status;
        const denied = status === 401 || status === 403;
        if ((denied || !ready) && styleIndex < styles.length - 1) {
          if (denied && styles[styleIndex].id === "maptiler") setAccessDenied(true);
          styleIndex += 1;
          map?.setStyle(styles[styleIndex].style);
          return;
        }
        // One missing tile after load should not hide a working map.
        if (!ready) setFailed(true);
      });
      map.on("style.load", () => {
        if (active) setStyleVersion((version) => version + 1);
      });
      map.once("load", () => {
        if (!active) return;
        ready = true;
        clearTimeout(timer);
        setFailed(false);
        map!.resize();
      });
    } catch {
      window.setTimeout(() => { if (active) setFailed(true); }, 0);
    }
    return () => {
      active = false;
      clearTimeout(timer);
      mapRef.current = null;
      map?.remove();
    };
  }, [hasContent]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    const bounds = new LngLatBounds();
    const placed = markers.map((marker) => {
      bounds.extend([marker.longitude, marker.latitude]);
      const content = document.createElement("div");
      content.textContent = marker.warning ? `${marker.name}: ${marker.warning}` : marker.name;
      if (marker.address) content.append(document.createElement("br"), marker.address);
      return new Marker({ color: marker.warning ? "#ac4d30" : "#42735b" })
        .setLngLat([marker.longitude, marker.latitude])
        .setPopup(new Popup({ offset: 16 }).setDOMContent(content))
        .addTo(map);
    });
    if (userLocation) {
      bounds.extend([userLocation.longitude, userLocation.latitude]);
      const element = document.createElement("div");
      element.className = "station-map-user";
      element.setAttribute("aria-label", "Your location");
      placed.push(new Marker({ element }).setLngLat([userLocation.longitude, userLocation.latitude]).addTo(map));
    }
    const route = map.getSource("driver-route") as GeoJSONSource | undefined;
    if (routeGeometry) {
      routeGeometry.coordinates.forEach((point) => bounds.extend([point[0], point[1]]));
      const data = { type: "Feature" as const, properties: {}, geometry: routeGeometry };
      if (route) route.setData(data);
      else {
        map.addSource("driver-route", { type: "geojson", data });
        map.addLayer({ id: "driver-route", type: "line", source: "driver-route", paint: { "line-color": "#42735b", "line-width": 5 } });
      }
      map.setPaintProperty("driver-route", "line-dasharray", routeDashed ? [1.5, 1.5] : [1, 0]);
    } else if (route) {
      map.removeLayer("driver-route");
      map.removeSource("driver-route");
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 0 });
    else if (center) map.jumpTo({ center: [center.longitude, center.latitude] });
    return () => placed.forEach((marker) => marker.remove());
  }, [styleVersion, markers, routeGeometry, center, userLocation, routeDashed]);

  // Hexagon heat layer (real aggregates supplied by the caller).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    const source = map.getSource("cy-hexes") as GeoJSONSource | undefined;
    if (!hexLayer) {
      if (map.getLayer("cy-hexes-fill")) map.removeLayer("cy-hexes-fill");
      if (map.getLayer("cy-hexes-line")) map.removeLayer("cy-hexes-line");
      if (source) map.removeSource("cy-hexes");
      return;
    }
    const data = hexLayer.data as Parameters<GeoJSONSource["setData"]>[0];
    if (source) source.setData(data);
    else map.addSource("cy-hexes", { type: "geojson", data });
    const [low, high] = hexColors[hexLayer.color];
    const max = Math.max(1, hexLayer.max);
    const fillColor = ["interpolate", ["linear"], ["coalesce", ["get", hexLayer.property], 0], 0, low, max, high] as unknown as string;
    if (!map.getLayer("cy-hexes-fill")) {
      map.addLayer({ id: "cy-hexes-fill", type: "fill", source: "cy-hexes", paint: { "fill-color": fillColor, "fill-opacity": 0.65 } });
      map.addLayer({ id: "cy-hexes-line", type: "line", source: "cy-hexes", paint: { "line-color": high, "line-width": 1, "line-opacity": 0.6 } });
    } else {
      map.setPaintProperty("cy-hexes-fill", "fill-color", fillColor);
      map.setPaintProperty("cy-hexes-line", "line-color", high);
    }
  }, [styleVersion, hexLayer]);

  // Straight-line search radius outline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    const source = map.getSource("cy-radius") as GeoJSONSource | undefined;
    if (!radius) {
      if (map.getLayer("cy-radius")) map.removeLayer("cy-radius");
      if (source) map.removeSource("cy-radius");
      return;
    }
    const data = circlePolygon(radius.center, radius.km);
    if (source) source.setData(data);
    else {
      map.addSource("cy-radius", { type: "geojson", data });
      map.addLayer({ id: "cy-radius", type: "line", source: "cy-radius", paint: { "line-color": "#2f5d47", "line-width": 2, "line-dasharray": [2, 2] } });
    }
  }, [styleVersion, radius]);

  // Real 3D: tilt the camera and extrude OpenStreetMap buildings (heights where mapped).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    const hasStyleBuildings = Boolean(map.getLayer("building-3d"));
    if (threeD && !hasStyleBuildings && !map.getLayer("cy-buildings-3d")) {
      if (!map.getSource("cy-openfreemap")) map.addSource("cy-openfreemap", { type: "vector", url: "https://tiles.openfreemap.org/planet" });
      map.addLayer({
        id: "cy-buildings-3d",
        type: "fill-extrusion",
        source: "cy-openfreemap",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": "#d8d2c2",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 4],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.85,
        },
      });
    }
    if (map.getLayer("cy-buildings-3d")) map.setLayoutProperty("cy-buildings-3d", "visibility", threeD ? "visible" : "none");
    if (hasStyleBuildings) map.setLayoutProperty("building-3d", "visibility", threeD ? "visible" : "none");
    map.easeTo({ pitch: threeD ? 55 : 0, bearing: threeD ? -17 : 0, zoom: threeD ? Math.max(map.getZoom(), 14.5) : map.getZoom(), duration: 700 });
  }, [styleVersion, threeD]);

  if (!hasContent)
    return (
      <p className="driver-empty">No mapped stations match these filters.</p>
    );
  return (
    <section aria-label="Fuel station map">
      <div className="truecost-map" ref={container} hidden={failed} />
      {failed && (
        <div className="driver-map-fallback" role="status">
          <strong>Map unavailable</strong>
          <p>
            {accessDenied
              ? "The map service denied access. The account owner needs to check the key, allowed hosts and plan permissions."
              : "The map service or WebGL could not load."}{" "}
            Use the station list and directions links below.
          </p>
          <ul>
            {markers.slice(0, 5).map((marker, index) => (
              <li key={index}>
                {marker.name}: {marker.latitude.toFixed(5)},{" "}
                {marker.longitude.toFixed(5)}
              </li>
            ))}
          </ul>
          {markers.length > 5 && (
            <p>{markers.length - 5} more stations are listed below.</p>
          )}
        </div>
      )}
    </section>
  );
}
