"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";
import "./trip-planner.css";

type Month = { month: string; planned_itineraries: number; completed_trips: number; planned_distance_km: number; actual_distance_km: number | null; estimated_fuel_litres: number; estimated_fuel_cost_pkr: number; failed_visits: number; avoided_trips: number; avoided_distance_km: number; realized_savings_pkr: number };
type Trip = { id: string; itinerary_id: string; status: string; started_at: string | null; planned_distance_km: number; planned_estimate_kind: string; actual_distance_km: number | null; estimated_fuel_litres: number; estimated_fuel_cost_pkr: number; actual_fuel_cost_pkr: number | null; km_per_litre_snapshot: number; price_pkr_per_litre_snapshot: number; is_demo: boolean; created_at: string; itineraries: { title: string | null } | null };
type Avoided = { avoided_round_trip_km: number; avoided_estimate_kind: string; avoided_fuel_cost_pkr: number; km_per_litre_snapshot: number; price_pkr_per_litre_snapshot: number; recorded_at: string; itinerary_stops: { errand_label: string; place_label: string | null } | null };
type History = { months: Month[]; trips: Trip[]; avoided: Avoided[]; failureCauses: Record<string, number> };

const pkr = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `Rs ${Math.round(Number(value)).toLocaleString("en-PK")}`);
const kmText = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${Number(value).toFixed(1)} km`);
const monthName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PK", { month: "long", year: "numeric", timeZone: "UTC" });

export function TripsHistory() {
  const t = useTranslations("history");
  const outcomesT = useTranslations("outcomes");
  const [history, setHistory] = useState<History | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/trips/history", { cache: "no-store", signal: controller.signal })
      .then(async (response) => (response.ok ? setHistory(await response.json()) : setFailure(await readFailure(response))))
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: t("offline") }); });
    return () => controller.abort();
  }, [t]);

  if (failure) return <main className="driver-page tp-page"><h1>{t("title")}</h1><SetupNotice failure={failure} /></main>;
  if (!history) return <main className="driver-page tp-page"><div className="driver-loading" role="status">{t("loading")}</div></main>;
  const totalSaved = history.months.reduce((sum, month) => sum + Number(month.realized_savings_pkr), 0);
  return (
    <main className="driver-page tp-page">
      <Link href="/app/trips" className="driver-secondary tp-back">{t("back")}</Link>
      <h1>{t("title")}</h1>
      <div className="driver-stats">
        <div><span>{t("realisedSavings")}</span><strong>{pkr(totalSaved)}</strong></div>
        <div><span>{t("avoidedTrips")}</span><strong>{history.avoided.length}</strong></div>
        <div><span>{t("completedTrips")}</span><strong>{history.trips.filter((trip) => trip.status === "completed").length}</strong></div>
      </div>

      <section className="tp-card">
        <h2>{t("monthlyTitle")}</h2>
        {!history.months.length ? <p className="driver-empty">{t("noTrips")}</p> : (
          <div className="driver-table-scroll">
            <table className="driver-table">
              <thead><tr><th>{t("month")}</th><th>{t("planned")}</th><th>{t("completed")}</th><th>{t("plannedKm")}</th><th>{t("actualKm")}</th><th>{t("fuelL")}</th><th>{t("fuelCost")}</th><th>{t("failedVisits")}</th><th>{t("avoided")}</th><th>{t("saved")}</th></tr></thead>
              <tbody>
                {history.months.map((month) => (
                  <tr key={month.month}>
                    <td>{monthName(month.month)}</td><td>{month.planned_itineraries}</td><td>{month.completed_trips}</td><td>{kmText(month.planned_distance_km)}</td>
                    <td>{kmText(month.actual_distance_km)}</td><td>{Number(month.estimated_fuel_litres).toFixed(1)}</td><td>{pkr(month.estimated_fuel_cost_pkr)}</td>
                    <td>{month.failed_visits}</td><td>{month.avoided_trips}</td><td>{pkr(month.realized_savings_pkr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tp-card">
        <h2>{t("tripsTitle")}</h2>
        <ul className="tp-list">
          {history.trips.map((trip) => (
            <li key={trip.id}>
              <Link href={`/app/trips/${trip.itinerary_id}`}>{trip.itineraries?.title ?? t("trip")}</Link>
              <span className="driver-small">
                {t(`status.${trip.status}`)} · {t("plannedVsActual", { planned: kmText(trip.planned_distance_km), actual: kmText(trip.actual_distance_km) })}
                {trip.planned_estimate_kind !== "road" && ` (${t("straightLine")})`} · {Number(trip.estimated_fuel_litres).toFixed(1)} L · {pkr(trip.estimated_fuel_cost_pkr)}
                {trip.is_demo && ` · ${t("demo")}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="tp-card">
        <h2>{t("failuresTitle")}</h2>
        {!Object.keys(history.failureCauses).length ? <p className="driver-small">{t("noFailures")}</p> : (
          <ul className="tp-list">{Object.entries(history.failureCauses).map(([cause, count]) => <li key={cause}>{outcomesT(`causes.${cause}`)}: {count}</li>)}</ul>
        )}
      </section>

      <section className="tp-card">
        <h2>{t("avoidedTitle")}</h2>
        {!history.avoided.length ? <p className="driver-small">{t("noAvoided")}</p> : (
          <ul className="tp-list">
            {history.avoided.map((row, index) => (
              <li key={index}>
                <strong>{row.itinerary_stops?.place_label ?? row.itinerary_stops?.errand_label}</strong>
                <span className="driver-small">{t("avoidedLine", { km: Number(row.avoided_round_trip_km).toFixed(1), kmpl: row.km_per_litre_snapshot, price: row.price_pkr_per_litre_snapshot, pkr: Math.round(Number(row.avoided_fuel_cost_pkr)) })}{row.avoided_estimate_kind !== "road" && ` (${t("straightLine")})`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tp-card">
        <h2>{t("howTitle")}</h2>
        <ul className="tp-list">
          <li>{t("how1")}</li>
          <li>{t("how2")}</li>
          <li>{t("how3")}</li>
          <li>{t("how4")}</li>
        </ul>
      </section>
    </main>
  );
}
