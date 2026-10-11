"use client";

import { TrueCostMap } from "./truecost-map";

type StationMapProps = {
  center: { latitude: number; longitude: number };
  markers: Array<{
    name: string;
    latitude: number;
    longitude: number;
    address?: string | null;
    warning?: string;
  }>;
  userLocation?: { latitude: number; longitude: number } | null;
};

export function StationMap(props: StationMapProps) {
  return <TrueCostMap {...props} />;
}
