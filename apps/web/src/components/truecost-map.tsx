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

export function TrueCostMap({
  markers,
  routeGeometry,
  center,
  userLocation,
}: {
  markers: StationMarker[];
  routeGeometry?: Geometry | null;
  center?: Coordinates;
  userLocation?: Coordinates | null;
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
    } else if (route) {
      map.removeLayer("driver-route");
      map.removeSource("driver-route");
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 0 });
    else if (center) map.jumpTo({ center: [center.longitude, center.latitude] });
    return () => placed.forEach((marker) => marker.remove());
  }, [styleVersion, markers, routeGeometry, center, userLocation]);

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
