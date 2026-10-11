"use client";
import { useState } from "react";
import { Check, Plus, Trash, X } from "@phosphor-icons/react";
import { type DriverVehicle, calculateMileage } from "@/lib/driver-records";
import { driverMutation, useDriverResource } from "./use-driver-resource";
type Log = {
  id: string;
  vehicle_id: string | null;
  litres: number;
  total_amount: number;
  odometer_km: number | null;
  logged_at: string;
  is_demo: boolean;
  stations: { name: string } | null;
};
function localDateTime() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
export function DriverFuelHistory({
  formOnly = false,
}: {
  formOnly?: boolean;
}) {
  const resource = useDriverResource<{ logs: Log[] }>("/api/fuel-logs"),
    vehicles = useDriverResource<{ vehicles: DriverVehicle[] }>(
      "/api/driver/vehicles",
    );
  const stations = useDriverResource<{
    stations: { id: string; name: string; is_demo: boolean }[];
  }>("/api/driver/stations");
  const [adding, setAdding] = useState(formOnly),
    [removing, setRemoving] = useState<string | null>(null),
    [vehicleFilter, setVehicleFilter] = useState("all"),
    [month, setMonth] = useState("all");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const logs = (resource.data?.logs ?? []).filter(
    (log) =>
      (vehicleFilter === "all" || log.vehicle_id === vehicleFilter) &&
      (month === "all" ||
        new Date(log.logged_at)
          .toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" })
          .startsWith(month)),
  );
  const economy = calculateMileage(
    logs.map((log) => ({
      ...log,
      litres: Number(log.litres),
      odometer_km: log.odometer_km === null ? null : Number(log.odometer_km),
    })),
  );
  const money = (value: number) =>
    `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
  return (
    <main className="dashboard-page">
      <div className="driver-page-heading">
        <div>
          <h1>{formOnly ? "Add fuel record" : "Fuel History"}</h1>
          <p>Your recorded refuelling, spending and vehicle mileage.</p>
        </div>
        {!adding && (
          <button className="driver-primary" onClick={() => setAdding(true)}>
            <Plus />
            Add fuel log
          </button>
        )}
      </div>
      {message && (
        <p
          className={`driver-message${failed ? " driver-error" : ""}`}
          role="status"
        >
          {message}
        </p>
      )}
      {resource.error && (
        <p className="driver-message driver-error" role="alert">
          {resource.error}
          <button className="driver-secondary" onClick={resource.refresh}>
            Try again
          </button>
        </p>
      )}
      {adding && (
        <section className="driver-section">
          <h2>Refuelling details</h2>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy(true);
              setMessage("");
              setFailed(false);
              try {
                await driverMutation("/api/fuel-logs", "POST", {
                  vehicleId: form.get("vehicleId") || null,
                  litres: form.get("litres"),
                  totalAmount: form.get("amount"),
                  odometer: form.get("odometer"),
                  loggedAt: new Date(String(form.get("date"))).toISOString(),
                  stationId: form.get("stationId") || null,
                });
                setAdding(false);
                setMessage("Fuel record saved to your account.");
                resource.refresh();
              } catch (e) {
                setFailed(true);
                setMessage(
                  e instanceof Error ? e.message : "Record could not be saved.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="driver-form-grid">
              <label>
                Vehicle
                <select name="vehicleId" disabled={vehicles.loading}>
                  <option value="">Not specified</option>
                  {vehicles.data?.vehicles.map((v) => (
                    <option value={v.id} key={v.id}>
                      {v.nickname}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date and time
                <input
                  name="date"
                  type="datetime-local"
                  required
                  defaultValue={localDateTime()}
                  max={localDateTime()}
                />
              </label>
              <label>
                Litres
                <input
                  name="litres"
                  type="number"
                  min="0.001"
                  max="500"
                  step="0.001"
                  required
                />
              </label>
              <label>
                Total amount (PKR)
                <input
                  name="amount"
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Station, if known
                <select name="stationId" disabled={stations.loading}>
                  <option value="">Unknown / not recorded</option>
                  {stations.data?.stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                      {station.is_demo ? " (Demo)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Odometer (km, optional)
                <input
                  name="odometer"
                  type="number"
                  min="0"
                  max="2000000"
                  step="0.1"
                />
              </label>
            </div>
            {vehicles.error && <p className="driver-small">{vehicles.error}</p>}
            {stations.error && <p className="driver-small">{stations.error}</p>}
            <div className="driver-actions">
              <button className="driver-primary" disabled={busy} type="submit">
                <Check />
                {busy ? "Saving..." : "Save fuel log"}
              </button>
              <button
                type="button"
                className="driver-secondary"
                disabled={busy}
                onClick={() => setAdding(false)}
              >
                <X />
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      {!resource.loading && resource.data && (
        <>
          <div className="driver-form-grid">
            <label>
              Filter vehicle
              <select
                value={vehicleFilter}
                onChange={(e) => setVehicleFilter(e.target.value)}
              >
                <option value="all">All records</option>
                {vehicles.data?.vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.nickname}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Filter month
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="all">All months</option>
                {Array.from(
                  new Set(
                    resource.data.logs.map((log) =>
                      new Date(log.logged_at)
                        .toLocaleDateString("en-CA", {
                          timeZone: "Asia/Karachi",
                        })
                        .slice(0, 7),
                    ),
                  ),
                )
                  .sort()
                  .reverse()
                  .map((value) => (
                    <option key={value}>{value}</option>
                  ))}
              </select>
            </label>
          </div>
          <div className="driver-stats">
            <div>
              <span>Recorded spend</span>
              <strong>
                {money(
                  logs.reduce((sum, log) => sum + Number(log.total_amount), 0),
                )}
              </strong>
            </div>
            <div>
              <span>Recorded fuel</span>
              <strong>
                {logs
                  .reduce((sum, log) => sum + Number(log.litres), 0)
                  .toLocaleString()}{" "}
                L
              </strong>
            </div>
            <div>
              <span>Estimated mileage</span>
              <strong>
                {economy ? `${economy.toFixed(1)} km/L` : "Not enough data"}
              </strong>
            </div>
          </div>
          <p className="driver-small">
            Summaries cover the latest 200 loaded records and current filters.
            Mileage needs two increasing odometer readings for the same saved
            vehicle and the fuel between them; partial-fill records can affect
            the estimate.
          </p>
          {!logs.length ? (
            <div className="driver-empty">
              <h2>No fuel records here yet</h2>
              <p>Add a refuelling record or change the filters.</p>
            </div>
          ) : (
            <div className="driver-table-scroll">
              <table className="driver-table">
                <caption className="sr-only">Your fuel records</caption>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Vehicle / Station</th>
                    <th>Fuel</th>
                    <th>Amount</th>
                    <th>Odometer</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        {new Intl.DateTimeFormat("en-PK", {
                          dateStyle: "medium",
                          timeZone: "Asia/Karachi",
                        }).format(new Date(log.logged_at))}
                        {log.is_demo && (
                          <span className="driver-badge">Demo record</span>
                        )}
                      </td>
                      <td>
                        {vehicles.data?.vehicles.find(
                          (v) => v.id === log.vehicle_id,
                        )?.nickname ?? "Not specified"}
                        <br />
                        <span className="driver-small">
                          {log.stations?.name ?? "Station unknown"}
                        </span>
                      </td>
                      <td>{log.litres} L</td>
                      <td>{money(Number(log.total_amount))}</td>
                      <td>{log.odometer_km ?? "Not recorded"}</td>
                      <td>
                        <button
                          className="driver-icon-button"
                          title="Delete fuel record"
                          aria-label={`Delete fuel record ${log.id}`}
                          onClick={() => setRemoving(log.id)}
                        >
                          <Trash />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {resource.loading && (
        <div className="driver-loading" role="status">
          Loading fuel history...
        </div>
      )}
      {removing && (
        <section className="driver-delete-confirm">
          <h2>Delete this fuel record?</h2>
          <div className="driver-actions">
            <button
              className="driver-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await driverMutation(`/api/fuel-logs/${removing}`, "DELETE");
                  setRemoving(null);
                  setFailed(false);
                  setMessage("Fuel record removed.");
                  resource.refresh();
                } catch (e) {
                  setFailed(true);
                  setMessage(
                    e instanceof Error ? e.message : "Deletion failed.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash />
              Confirm deletion
            </button>
            <button
              className="driver-secondary"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Keep record
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
