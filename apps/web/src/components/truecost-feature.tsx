"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { TrueCostMap } from "./truecost-map";
import { useDriverResource } from "./use-driver-resource";
import type { DriverVehicle } from "@/lib/driver-records";
import { calculateEstimate } from "@/lib/truecost";

type Result = {
  fuelType: string;
  litres: number;
  directDistanceKm: number;
  kmPerLitre: number | null;
  price: {
    amount: number;
    source: string;
    effectiveAt: string;
    isDemo: boolean;
  };
  routing: "osrm" | "openrouteservice" | "approximate";
  routeDurationMinutes: number | null;
  assumptions: string[];
  routeGeometry: { type: "LineString"; coordinates: number[][] } | null;
  stations: Array<{
    id: string;
    name: string;
    address: string | null;
    isDemo: boolean;
    detourKm: number;
    purchaseCost: number;
    detourFuelCost: number | null;
    totalCost: number | null;
    latitude: number;
    longitude: number;
    availability: string;
    routing: string;
    discount: number;
  }>;
};

export function TrueCostFeature() {
  const t = useTranslations("dashboard.truecost");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const vehicles = useDriverResource<{ vehicles: DriverVehicle[] }>(
    "/api/driver/vehicles",
  );
  const [vehicleId, setVehicleId] = useState("");
  const [personal, setPersonal] = useState<ReturnType<
    typeof calculateEstimate
  > | null>(null);

  function fillLocation(prefix: "origin" | "destination") {
    if (!navigator.geolocation) {
      setMessage(t("locationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = document.querySelector<HTMLInputElement>(
          `[name="${prefix}Latitude"]`,
        );
        const longitude = document.querySelector<HTMLInputElement>(
          `[name="${prefix}Longitude"]`,
        );
        if (latitude && longitude) {
          latitude.value = coords.latitude.toFixed(6);
          longitude.value = coords.longitude.toFixed(6);
        }
      },
      () => setMessage(t("locationDenied")),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/truecost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    }).catch(() => null);
    setLoading(false);
    if (!response?.ok) {
      const error = (await response?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setMessage(error?.error?.message ?? t("loadError"));
      return;
    }
    setResult((await response.json()) as Result);
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting">
        <div>
          <p className="dashboard-eyebrow">{t("calculate")}</p>
          <h1>{t("title")}</h1>
        </div>
        <p className="dashboard-intro">{t("intro")}</p>
      </section>
      <section className="dashboard-card truecost-form-card">
        <form className="dashboard-form" onSubmit={submit}>
          <label>
            Saved vehicle (optional)
            <select
              name="vehicleId"
              value={vehicleId}
              onChange={(event) => {
                setVehicleId(event.target.value);
                const vehicle = vehicles.data?.vehicles.find(
                  (item) => item.id === event.target.value,
                );
                const fuel = event.target.form?.elements.namedItem(
                  "fuelType",
                ) as HTMLSelectElement | null;
                if (vehicle && fuel) fuel.value = vehicle.fuel_type;
              }}
            >
              <option value="">Enter my own fuel economy</option>
              {vehicles.data?.vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.nickname}
                </option>
              ))}
            </select>
          </label>
          {vehicles.error && (
            <p role="alert">
              {vehicles.error}
              <button type="button" onClick={vehicles.refresh}>
                Retry vehicles
              </button>
            </p>
          )}
          <label>
            Estimated km/L
            <input
              name="kmPerLitre"
              type="number"
              min="0.1"
              max="200"
              step="0.1"
            />
          </label>
          <p>
            Saved vehicle economy takes precedence when supplied. Without
            economy, only fuel purchase cost can be shown.
          </p>
          <div className="truecost-form-section">
            <div className="truecost-section-heading">
              <span className="truecost-step">1</span>
              <div>
                <h2>{t("routeSectionTitle")}</h2>
                <p>{t("routeSectionDescription")}</p>
              </div>
            </div>
            <div className="truecost-location-grid">
              <fieldset className="truecost-location">
                <legend>{t("originTitle")}</legend>
                <div className="form-row">
                  <label>
                    {t("originLatitude")}
                    <input
                      name="originLatitude"
                      type="number"
                      step="any"
                      required
                    />
                  </label>
                  <label>
                    {t("originLongitude")}
                    <input
                      name="originLongitude"
                      type="number"
                      step="any"
                      required
                    />
                  </label>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => fillLocation("origin")}
                >
                  {t("useLocation")}
                </button>
              </fieldset>
              <fieldset className="truecost-location">
                <legend>{t("destinationTitle")}</legend>
                <div className="form-row">
                  <label>
                    {t("destinationLatitude")}
                    <input
                      name="destinationLatitude"
                      type="number"
                      step="any"
                      required
                    />
                  </label>
                  <label>
                    {t("destinationLongitude")}
                    <input
                      name="destinationLongitude"
                      type="number"
                      step="any"
                      required
                    />
                  </label>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => fillLocation("destination")}
                >
                  {t("useDestinationLocation")}
                </button>
              </fieldset>
            </div>
          </div>
          <div className="truecost-form-section">
            <div className="truecost-section-heading">
              <span className="truecost-step">2</span>
              <div>
                <h2>{t("fuelSectionTitle")}</h2>
                <p>{t("fuelSectionDescription")}</p>
              </div>
            </div>
            <div className="truecost-fuel-grid">
              <label>
                {t("fuelType")}
                <select name="fuelType" defaultValue="petrol">
                  <option value="petrol">{t("fuels.petrol")}</option>
                  <option value="diesel">{t("fuels.diesel")}</option>
                  <option value="cng">{t("fuels.cng")}</option>
                </select>
              </label>
              <label>
                {t("litres")}
                <input
                  name="litres"
                  type="number"
                  min="0.1"
                  max="500"
                  step="0.1"
                  required
                />
              </label>
            </div>
          </div>
          <button
            className="primary-button truecost-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? t("calculating") : t("calculate")}
          </button>
        </form>
      </section>
      {message && (
        <p className="inline-alert" role="alert">
          {message}
        </p>
      )}
      {result && (
        <>
          <section className="dashboard-card truecost-summary">
            <h2>{t("resultTitle")}</h2>
            <div className="truecost-summary-grid">
              <p>
                {t("price", {
                  amount: result.price.amount.toFixed(2),
                  source: result.price.source,
                })}
              </p>
              <p>
                {t("directDistance", {
                  distance: result.directDistanceKm.toFixed(1),
                })}
              </p>
              <p>
                {result.routing === "approximate"
                  ? t("approximateRouting")
                  : t("roadRouting", {
                      provider: result.routing.toUpperCase(),
                      minutes: result.routeDurationMinutes?.toFixed(0) ?? "—",
                    })}
              </p>
              <p>
                {result.kmPerLitre
                  ? t("efficiency", { value: result.kmPerLitre.toFixed(1) })
                  : t("missingEfficiency")}
              </p>
            </div>
          </section>
          <div className="station-list">
            <TrueCostMap
              routeGeometry={result.routeGeometry}
              markers={result.stations.map((station) => ({
                name: station.name,
                latitude: station.latitude,
                longitude: station.longitude,
                warning:
                  station.availability === "unavailable"
                    ? t("fuelFinished")
                    : undefined,
              }))}
            />
            {result.price.isDemo && (
              <p className="demo-badge">
                Demo price data: comparison is not live.
              </p>
            )}
            {!result.stations.length && (
              <p>
                No stations with supported fuel were found near the selected
                origin.
              </p>
            )}
            {result.stations.map((station) => (
              <section className="dashboard-card" key={station.id}>
                <h2>{station.name}</h2>
                {station.address && <p>{station.address}</p>}
                <p>{t("detour", { distance: station.detourKm.toFixed(1) })}</p>
                <p>
                  {station.routing === "approximate"
                    ? "Straight-line estimate only; no road route or ETA available."
                    : `Road route via ${station.routing}`}
                </p>
                <p>Availability: {station.availability.replaceAll("_", " ")}</p>
                {station.availability === "unavailable" && (
                  <p className="inline-alert" role="status">
                    {t("fuelFinished")}
                  </p>
                )}
                <p>
                  {t("purchase", { amount: station.purchaseCost.toFixed(2) })}
                </p>
                <p>
                  Estimated detour fuel cost:{" "}
                  {station.detourFuelCost === null
                    ? "Unknown"
                    : `PKR ${station.detourFuelCost.toFixed(2)}`}
                  . Eligible discount: PKR {station.discount.toFixed(2)} (no
                  verified offers).
                </p>
                {station.totalCost === null ? (
                  <p>{t("partialTotal")}</p>
                ) : (
                  <p>
                    <strong>
                      {t("total", { amount: station.totalCost.toFixed(2) })}
                    </strong>
                  </p>
                )}
                {station.isDemo && (
                  <span className="demo-badge">{t("demo")}</span>
                )}
              </section>
            ))}
          </div>
          <section className="notice-card">
            <h2>{t("assumptionsTitle")}</h2>
            <ul>
              {result.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </section>
        </>
      )}
      <section className="driver-section">
        <h2>Personal-figures calculator</h2>
        <p>
          Your assumptions only, not live station prices or a verified route. No
          discount is applied.
        </p>
        <form
          className="dashboard-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setPersonal(
              calculateEstimate({
                directDistanceKm: 0,
                viaStationDistanceKm: Number(form.get("extraKm")),
                litres: Number(form.get("quantity")),
                pricePerLitre: Number(form.get("price")),
                kmPerLitre: Number(form.get("economy")),
              }),
            );
          }}
        >
          <div className="form-row">
            <label>
              Planned litres
              <input
                name="quantity"
                type="number"
                min="0.1"
                max="500"
                step="any"
                required
              />
            </label>
            <label>
              Your assumed PKR/litre
              <input
                name="price"
                type="number"
                min="0.01"
                step="any"
                required
              />
            </label>
            <label>
              Extra distance (km)
              <input name="extraKm" type="number" min="0" step="any" required />
            </label>
            <label>
              Estimated km/L
              <input
                name="economy"
                type="number"
                min="0.1"
                max="200"
                step="any"
                required
              />
            </label>
          </div>
          <button type="submit">Calculate personal estimate</button>
        </form>
        {personal && (
          <p role="status">
            Personal estimate: PKR {personal.purchaseCost.toFixed(2)} fuel + PKR{" "}
            {personal.detourFuelCost!.toFixed(2)} detour - PKR 0 discount = PKR{" "}
            {personal.totalCost!.toFixed(2)}.
          </p>
        )}
      </section>
    </main>
  );
}
