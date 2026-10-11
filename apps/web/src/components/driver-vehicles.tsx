"use client";
import { useState } from "react";
import {
  Car,
  Check,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { type DriverVehicle } from "@/lib/driver-records";
import { driverMutation, useDriverResource } from "./use-driver-resource";

export function DriverVehicles() {
  const { data, loading, error, refresh } = useDriverResource<{
    vehicles: DriverVehicle[];
  }>("/api/driver/vehicles");
  const [editing, setEditing] = useState<DriverVehicle | "new" | null>(null),
    [removing, setRemoving] = useState<DriverVehicle | null>(null);
  const [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <main className="dashboard-page">
      <div className="driver-page-heading">
        <div>
          <h1>My Car</h1>
          <p>Save your vehicles and fuel economy estimates.</p>
        </div>
        <button
          className="driver-primary"
          onClick={() => {
            setEditing("new");
            setRemoving(null);
            setMessage("");
          }}
        >
          <Plus />
          Add vehicle
        </button>
      </div>
      {message && (
        <p
          className={`driver-message${failed ? " driver-error" : ""}`}
          role="status"
        >
          {message}
        </p>
      )}
      {error && (
        <p className="driver-message driver-error" role="alert">
          {error}
          <button className="driver-secondary" onClick={refresh}>
            Try again
          </button>
        </p>
      )}
      {loading ? (
        <div className="driver-loading" role="status">
          Loading vehicles...
        </div>
      ) : !data?.vehicles.length ? (
        <div className="driver-empty">
          <Car size={32} />
          <h2>No saved vehicles yet</h2>
          <p>
            Add your car or motorcycle to use its economy estimate in Save
            Money.
          </p>
        </div>
      ) : (
        <div className="driver-record-list">
          {data.vehicles.map((vehicle) => (
            <article className="driver-record" key={vehicle.id}>
              <Car />
              <div>
                <h3>{vehicle.nickname}</h3>
                <p>
                  {vehicle.vehicle_type} / {vehicle.fuel_type.toUpperCase()} /{" "}
                  {vehicle.estimated_km_per_litre
                    ? `${vehicle.estimated_km_per_litre} km/L (your estimate)`
                    : "Economy not entered"}
                </p>
              </div>
              <div className="driver-actions">
                <button
                  className="driver-icon-button"
                  title="Edit vehicle"
                  aria-label={`Edit ${vehicle.nickname}`}
                  onClick={() => {
                    setEditing(vehicle);
                    setRemoving(null);
                  }}
                >
                  <PencilSimple />
                </button>
                <button
                  className="driver-icon-button"
                  title="Delete vehicle"
                  aria-label={`Delete ${vehicle.nickname}`}
                  onClick={() => {
                    setRemoving(vehicle);
                    setEditing(null);
                  }}
                >
                  <Trash />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {removing && (
        <section
          className="driver-delete-confirm"
          aria-label="Confirm vehicle deletion"
        >
          <h2>Delete {removing.nickname}?</h2>
          <p>
            Your fuel logs stay in Fuel History. Deleted vehicles are excluded
            from mileage calculations.
          </p>
          <div className="driver-actions">
            <button
              className="driver-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setFailed(false);
                try {
                  await driverMutation(
                    `/api/driver/vehicles?id=${removing.id}`,
                    "DELETE",
                  );
                  setRemoving(null);
                  setMessage("Vehicle removed. Your fuel records were kept.");
                  refresh();
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
              Keep vehicle
            </button>
          </div>
        </section>
      )}
      {editing && (
        <section className="driver-section">
          <h2>{editing === "new" ? "Add vehicle" : "Edit vehicle"}</h2>
          <form
            key={editing === "new" ? "new" : editing.id}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy(true);
              setFailed(false);
              setMessage("");
              try {
                await driverMutation("/api/driver/vehicles", "POST", {
                  id: editing === "new" ? undefined : editing.id,
                  nickname: form.get("nickname"),
                  vehicleType: form.get("vehicleType"),
                  fuelType: form.get("fuelType"),
                  estimatedKmPerLitre: form.get("economy"),
                });
                setEditing(null);
                setMessage("Vehicle saved to your account.");
                refresh();
              } catch (e) {
                setFailed(true);
                setMessage(e instanceof Error ? e.message : "Save failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="driver-form-grid">
              <label>
                Nickname
                <input
                  name="nickname"
                  required
                  maxLength={60}
                  defaultValue={editing === "new" ? "" : editing.nickname}
                  placeholder="My city car"
                />
              </label>
              <label>
                Vehicle type
                <select
                  name="vehicleType"
                  defaultValue={
                    editing === "new" ? "car" : editing.vehicle_type
                  }
                >
                  <option value="car">Car</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="van">Van</option>
                  <option value="truck">Truck</option>
                </select>
              </label>
              <label>
                Fuel type
                <select
                  name="fuelType"
                  defaultValue={
                    editing === "new" ? "petrol" : editing.fuel_type
                  }
                >
                  <option value="petrol">Petrol</option>
                  <option value="diesel">Diesel</option>
                  <option value="cng">CNG</option>
                </select>
              </label>
              <label>
                Estimated economy (km/L, optional)
                <input
                  name="economy"
                  type="number"
                  min="0.1"
                  max="200"
                  step="0.1"
                  defaultValue={
                    editing === "new"
                      ? ""
                      : (editing.estimated_km_per_litre ?? "")
                  }
                />
              </label>
            </div>
            <div className="driver-actions">
              <button className="driver-primary" disabled={busy} type="submit">
                <Check />
                {busy ? "Saving..." : "Save vehicle"}
              </button>
              <button
                className="driver-secondary"
                disabled={busy}
                type="button"
                onClick={() => setEditing(null)}
              >
                <X />
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
