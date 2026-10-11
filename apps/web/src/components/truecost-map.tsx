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
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
type StationMarker = {
  name: string;
  latitude: number;
  longitude: number;
  warning?: string;
  address?: string | null;
};
type Geometry = { type: "LineString"; coordinates: number[][] };

const openStreetMapStyle: StyleSpecification = {
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

export function TrueCostMap({
  markers,
  routeGeometry,
  center,
  userLocation,
}: {
  markers: StationMarker[];
  routeGeometry?: Geometry | null;
  center?: { latitude: number; longitude: number };
  userLocation?: { latitude: number; longitude: number } | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  useEffect(() => {
    const origin = center ?? markers[0];
    if (!container.current || !origin) return;
    let map: Map | undefined;
    let ready = false;
    let hadError = false;
    let usingFallbackStyle = !key;
    let active = true;
    const reset = window.setTimeout(() => {
      setFailed(false);
      setAccessDenied(false);
    }, 0);
    const timer = window.setTimeout(() => {
      if (!ready) setFailed(true);
    }, 18000);
    try {
      setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);
      map = new Map({
        container: container.current,
        style: key
          ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`
          : openStreetMapStyle,
        center: [origin.longitude, origin.latitude],
        zoom: 12,
        cooperativeGestures: true,
      });
      map.addControl(new NavigationControl(), "top-right");
      map.on("error", (event) => {
        if (!active) return;
        hadError = true;
        const status = (event.error as Error & { status?: number }).status;
        if ((status === 401 || status === 403) && !usingFallbackStyle) {
          usingFallbackStyle = true;
          setAccessDenied(true);
          map?.setStyle(openStreetMapStyle);
          setFailed(false);
          return;
        }
        setFailed(true);
      });
      const bounds = new LngLatBounds();
      markers.forEach((marker) => {
        bounds.extend([marker.longitude, marker.latitude]);
        const content = document.createElement("div");
        content.textContent = marker.warning
          ? `${marker.name}: ${marker.warning}`
          : marker.name;
        if (marker.address)
          content.append(document.createElement("br"), marker.address);
        new Marker({ color: marker.warning ? "#ac4d30" : "#42735b" })
          .setLngLat([marker.longitude, marker.latitude])
          .setPopup(new Popup({ offset: 16 }).setDOMContent(content))
          .addTo(map!);
      });
      if (userLocation) {
        bounds.extend([userLocation.longitude, userLocation.latitude]);
        const element = document.createElement("div");
        element.className = "station-map-user";
        element.setAttribute("aria-label", "Your location");
        new Marker({ element })
          .setLngLat([userLocation.longitude, userLocation.latitude])
          .addTo(map);
      }
      routeGeometry?.coordinates.forEach((point) =>
        bounds.extend([point[0], point[1]]),
      );
      map.once("load", () => {
        if (!active) return;
        ready = true;
        clearTimeout(timer);
        if (!hadError) setFailed(false);
        map!.resize();
        if (routeGeometry) {
          map!.addSource("driver-route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: routeGeometry },
          });
          map!.addLayer({
            id: "driver-route",
            type: "line",
            source: "driver-route",
            paint: { "line-color": "#42735b", "line-width": 5 },
          });
        }
        if (!bounds.isEmpty())
          map!.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 0 });
      });
    } catch {
      window.setTimeout(() => { if (active) setFailed(true); }, 0);
    }
    return () => {
      active = false;
      clearTimeout(reset);
      clearTimeout(timer);
      map?.remove();
    };
  }, [markers, routeGeometry, key, center, userLocation]);
  if (!markers.length && !center)
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
