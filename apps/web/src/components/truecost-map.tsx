"use client";

import { useEffect, useRef } from "react";
import { Map, Marker, NavigationControl, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type StationMarker = {
  name: string;
  latitude: number;
  longitude: number;
  warning?: string;
};

export function TrueCostMap({ markers }: { markers: StationMarker[] }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current || !markers.length) return;
    const mapStyle = process.env.NEXT_PUBLIC_MAPTILER_KEY
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`
      : "https://demotiles.maplibre.org/style.json";
    const map = new Map({
      container: container.current,
      style: mapStyle,
      center: [markers[0].longitude, markers[0].latitude],
      zoom: 11,
    });
    map.addControl(new NavigationControl(), "top-right");
    markers.forEach((marker) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `truecost-marker${marker.warning ? " has-warning" : ""}`;
      element.setAttribute("aria-label", marker.warning ? `${marker.name}: ${marker.warning}` : marker.name);
      element.textContent = marker.warning ? "!" : "•";
      const popupContent = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = marker.name;
      popupContent.append(title);
      if (marker.warning) {
        const warning = document.createElement("span");
        warning.textContent = marker.warning;
        popupContent.append(document.createElement("br"), warning);
      }
      new Marker({ element })
        .setLngLat([marker.longitude, marker.latitude])
        .setPopup(new Popup({ offset: 16 }).setDOMContent(popupContent))
        .addTo(map);
    });
    return () => map.remove();
  }, [markers]);
  return <div className="truecost-map" ref={container} aria-label="Fuel station route map" />;
}
