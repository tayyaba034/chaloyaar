"use client";

import { GasPump, Calculator, Wrench, Car } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import type { DriverVehicle } from "@/lib/driver-records";
import { useDriverResource } from "./use-driver-resource";

type Summary = {
  profile: { displayName: string | null };
  monthlySpend: number | null;
  kmPerLitre: number | null;
  recentFuelLog: {
    logged_at: string;
    litres: number;
    total_amount: number;
    is_demo: boolean;
  } | null;
  activeRequest: {
    id: string;
    service_type: string;
    status: string;
    is_demo: boolean;
  } | null;
  nearestStation: {
    id: string;
    name: string;
    distanceKm: number;
    isDemo: boolean;
    source: string;
    availability: {
      state: string;
      source: string | null;
      reportedAt: string | null;
      isDemo: boolean;
    };
  } | null;
};
const shortcuts = [
  { label: "Find Petrol", href: "/app/stations", icon: GasPump },
  { label: "Save Money", href: "/app/truecost", icon: Calculator },
  { label: "Get Help", href: "/app/help", icon: Wrench },
  { label: "My Car", href: "/app/vehicle", icon: Car },
];

export function DriverDashboard() {
  const summary = useDriverResource<Summary>("/api/dashboard/driver");
  const vehicles = useDriverResource<{ vehicles: DriverVehicle[] }>(
    "/api/driver/vehicles",
  );
  const data = summary.data;
  const vehicle = vehicles.data?.vehicles[0];
  return (
    <main className="driver-page">
      <header className="driver-page-heading">
        <div>
          <p className="eyebrow">Driver Home</p>
          <h1>
            {data?.profile.displayName
              ? `Hello, ${data.profile.displayName}`
              : "Your Driver account"}
          </h1>
          <p>Your vehicles, refuelling records, and roadside requests.</p>
        </div>
      </header>
      <nav className="driver-shortcuts" aria-label="Driver shortcuts">
        {shortcuts.map(({ label, href, icon: Icon }) => (
          <Link href={href} key={href}>
            <Icon size={26} aria-hidden="true" />
            <strong>{label}</strong>
          </Link>
        ))}
      </nav>
      {summary.loading && (
        <p className="driver-empty" role="status">
          Loading your account...
        </p>
      )}
      {summary.error && (
        <p className="driver-error" role="alert">
          {summary.error}{" "}
          <button className="driver-secondary" onClick={summary.refresh}>
            Retry
          </button>
        </p>
      )}
      <section className="driver-section">
        <h2>Account overview</h2>
        <div className="driver-summary-grid">
          <article>
            <h3>Saved vehicle</h3>
            {vehicles.loading ? (
              <p>Loading vehicles...</p>
            ) : vehicles.error ? (
              <p role="alert">
                {vehicles.error}{" "}
                <button onClick={vehicles.refresh}>Retry</button>
              </p>
            ) : vehicle ? (
              <>
                <strong>{vehicle.nickname}</strong>
                <p>
                  {vehicle.vehicle_type} / {vehicle.fuel_type}
                </p>
                <p>
                  {vehicle.estimated_km_per_litre
                    ? `${vehicle.estimated_km_per_litre} km/L (your estimate)`
                    : "No fuel economy entered"}
                </p>
              </>
            ) : (
              <p>No vehicles saved yet.</p>
            )}
            <Link href="/app/vehicle">Manage vehicles</Link>
          </article>
          <article>
            <h3>Recent refuelling</h3>
            {data?.recentFuelLog ? (
              <>
                <strong>
                  PKR {Number(data.recentFuelLog.total_amount).toLocaleString()}
                </strong>
                <p>
                  {Number(data.recentFuelLog.litres)} litres /{" "}
                  {new Date(data.recentFuelLog.logged_at).toLocaleDateString(
                    "en-PK",
                    { timeZone: "Asia/Karachi" },
                  )}
                </p>
                {data.recentFuelLog.is_demo && (
                  <span className="demo-badge">Demo record</span>
                )}
              </>
            ) : (
              <p>
                {summary.loading
                  ? "Loading records..."
                  : "No recent fuel records."}
              </p>
            )}
            <Link href="/app/fuel-history">Open Fuel History</Link>
          </article>
          <article>
            <h3>Roadside request</h3>
            {data?.activeRequest ? (
              <>
                <strong>{data.activeRequest.service_type}</strong>
                <p>
                  {data.activeRequest.status === "confirmed"
                    ? "Accepted"
                    : data.activeRequest.status.replaceAll("_", " ")}
                </p>
                {data.activeRequest.is_demo && (
                  <span className="demo-badge">Demo request</span>
                )}
                <Link href={`/app/help/${data.activeRequest.id}`}>
                  View request
                </Link>
              </>
            ) : (
              <>
                <p>
                  {summary.loading
                    ? "Loading requests..."
                    : "No active roadside request."}
                </p>
                <Link href="/app/help">Get Help</Link>
              </>
            )}
          </article>
        </div>
      </section>
      {data && (
        <section className="driver-section">
          <h2>Fuel summary</h2>
          <div className="driver-stats">
            <div>
              <span>This month</span>
              <strong>
                {data.monthlySpend === null
                  ? "No records"
                  : `PKR ${data.monthlySpend.toLocaleString()}`}
              </strong>
            </div>
            <div>
              <span>Recorded mileage estimate</span>
              <strong>
                {data.kmPerLitre === null
                  ? "Not enough data"
                  : `${data.kmPerLitre.toFixed(1)} km/L`}
              </strong>
            </div>
          </div>
          <p className="driver-muted">
            Based on up to 200 records from the last year, including records
            labelled demo. Mileage uses separate vehicle intervals and assumes
            comparable refills; it is not a guaranteed fuel economy.
          </p>
        </section>
      )}
      {data && (
        <section className="driver-section">
          <h2>Petrol near Faisalabad city centre</h2>
          {data.nearestStation ? (
            <>
              <h3>
                <Link href={`/app/stations/${data.nearestStation.id}`}>
                  {data.nearestStation.name}
                </Link>
              </h3>
              <p>
                {data.nearestStation.distanceKm.toFixed(1)} km approximately,
                straight-line from city centre, not your current location.
              </p>
              <p>
                <strong>
                  {data.nearestStation.availability.state.replaceAll("_", " ")}
                </strong>{" "}
                / Report source:{" "}
                {data.nearestStation.availability.source ?? "No current report"}
              </p>
              <p>
                Last reported:{" "}
                {data.nearestStation.availability.reportedAt
                  ? new Date(
                      data.nearestStation.availability.reportedAt,
                    ).toLocaleString()
                  : "Unknown"}
                . Station source: {data.nearestStation.source}
              </p>
              {(data.nearestStation.isDemo ||
                data.nearestStation.availability.isDemo) && (
                <span className="demo-badge">Demo station/report data</span>
              )}
            </>
          ) : (
            <p>No station information is available for this area.</p>
          )}
          <Link href="/app/stations">Find Petrol</Link>
        </section>
      )}
    </main>
  );
}
