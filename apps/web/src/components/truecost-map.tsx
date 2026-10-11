"use client";
import { useEffect, useRef, useState } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  Popup,
  LngLatBounds,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
type StationMarker = {
  name: string;
  latitude: number;
  longitude: number;
  warning?: string;
  address?: string | null;
};
type Geometry = { type: "LineString"; coordinates: number[][] };
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
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  useEffect(() => {
    const origin = center ?? markers[0];
    if (!container.current || !origin || !key) return;
    let map: Map | undefined;
    let ready = false;
    const timer = window.setTimeout(() => {
      if (!ready) setFailed(true);
    }, 18000);
    try {
      map = new Map({
        container: container.current,
        style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`,
        center: [origin.longitude, origin.latitude],
        zoom: 12,
        cooperativeGestures: true,
      });
      map.addControl(new NavigationControl(), "top-right");
      map.on("error", () => {
        if (!ready) setFailed(true);
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
        ready = true;
        clearTimeout(timer);
        setFailed(false);
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
      window.setTimeout(() => setFailed(true), 0);
    }
    return () => {
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
      <div className="truecost-map" ref={container} hidden={!key || failed} />
      {(!key || failed) && (
        <div className="driver-map-fallback" role="status">
          <strong>Map unavailable</strong>
          <p>
            {key
              ? "The map service or WebGL could not load."
              : "A map service key is not configured."}{" "}
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
