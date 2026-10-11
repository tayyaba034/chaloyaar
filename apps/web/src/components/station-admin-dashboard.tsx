"use client";

import { useEffect, useState } from "react";

type Station = {
  station_id: string;
  stations: { id: string; name: string; address: string | null; supported_fuels: string[] };
};

const labels: Record<string, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  cng: "CNG",
};

export function StationAdminDashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyKey, setBusyKey] = useState("");

  useEffect(() => {
    void fetch("/api/station-admin/stations", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Assigned stations could not be loaded.");
        return (await response.json()) as { stations: Station[] };
      })
      .then((result) => setStations(result.stations))
      .catch(() => setMessage("Your stations could not be loaded. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  async function updateAvailability(stationId: string, fuelType: string, status: "available" | "unavailable") {
    const key = `${stationId}:${fuelType}`;
    setBusyKey(key);
    setMessage("");
    try {
      const response = await fetch("/api/station-admin/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId, fuelType, status }),
      });
      if (!response.ok) throw new Error("Availability could not be updated.");
      setMessage(`${labels[fuelType]} availability was updated. It will expire in two hours unless renewed.`);
    } catch {
      setMessage("Availability could not be updated. Check that your station account is approved.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting">
        <div>
          <p className="eyebrow">STATION ADMIN</p>
          <h1>Update live fuel availability</h1>
          <p>Only assigned stations appear here. Each update expires after two hours.</p>
        </div>
      </section>
      {message && <p className="inline-alert" role="status">{message}</p>}
      {loading ? <div className="dashboard-skeleton" aria-busy="true" /> : stations.length ? (
        <div className="station-list">
          {stations.map(({ station_id: stationId, stations: station }) => (
            <section className="dashboard-card" key={stationId}>
              <h2>{station.name}</h2>
              {station.address && <p>{station.address}</p>}
              <div className="provider-request-actions">
                {station.supported_fuels.map((fuel) => {
                  const key = `${stationId}:${fuel}`;
                  return (
                    <div key={fuel}>
                      <strong>{labels[fuel] ?? fuel}</strong>
                      <button type="button" disabled={busyKey === key} onClick={() => void updateAvailability(stationId, fuel, "available")}>Available</button>
                      <button type="button" disabled={busyKey === key} onClick={() => void updateAvailability(stationId, fuel, "unavailable")}>Unavailable</button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="notice-card"><h2>No assigned stations</h2><p>An app administrator must verify your account and assign your station before you can publish availability.</p></section>
      )}
    </main>
  );
}
