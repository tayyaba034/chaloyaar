"use client";

import { useEffect, useRef } from "react";
import { Map, Marker, NavigationControl, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type StationMapMarker = {
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
};

type StationMapProps = {
  center: { latitude: number; longitude: number };
  markers: StationMapMarker[];
  userLocation?: { latitude: number; longitude: number } | null;
};

export function StationMap({ center, markers, userLocation }: StationMapProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const mapStyle = process.env.NEXT_PUBLIC_MAPTILER_KEY
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`
      : "https://demotiles.maplibre.org/style.json";
    const map = new Map({
      container: container.current,
      style: mapStyle,
      center: [center.longitude, center.latitude],
      zoom: markers.length ? 12 : 11,
    });
    let fallbackApplied = false;
    map.on("error", () => {
      if (fallbackApplied || !process.env.NEXT_PUBLIC_MAPTILER_KEY) return;
      fallbackApplied = true;
      map.setStyle("https://demotiles.maplibre.org/style.json");
    });
    map.addControl(new NavigationControl(), "top-right");

    markers.forEach((marker) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "station-map-marker";
      element.setAttribute("aria-label", marker.name);
      element.textContent = "⛽";
      const popup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = marker.name;
      popup.append(title);
      if (marker.address) {
        const address = document.createElement("p");
        address.textContent = marker.address;
        popup.append(address);
      }
      new Marker({ element })
        .setLngLat([marker.longitude, marker.latitude])
        .setPopup(new Popup({ offset: 18 }).setDOMContent(popup))
        .addTo(map);
    });

    if (userLocation) {
      const location = document.createElement("div");
      location.className = "station-map-user";
      location.setAttribute("aria-label", "Your location");
      new Marker({ element: location })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(map);
    }

    return () => map.remove();
  }, [center, markers, userLocation]);

  return <div className="station-map" ref={container} aria-label="Fuel station map" />;
}
