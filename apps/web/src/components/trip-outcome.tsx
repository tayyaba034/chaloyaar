"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";
import "./trip-planner.css";

type Stop = { id: string; errandLabel: string; placeLabel: string | null; status: string; businessId: string | null; availability: { state: string } | null };
type Outcome = { itinerary_stop_id: string; outcome: string; failure_cause: string | null; avoided_fuel_cost_pkr: number | null; avoided_round_trip_km: number | null; avoided_estimate_kind: string | null };
type View = { itinerary: { workflowState: string; metrics: Record<string, unknown> }; stops: Stop[]; outcomes: Outcome[]; trip: { status: string; planned_distance_km: number } | null };
const causes = ["closed", "service_unavailable", "part_unavailable", "long_wait", "not_found", "other"] as const;

// After the trip: what happened at each stop, actual distance, and avoided trips (only with evidence).
export function TripOutcome({ tripId }: { tripId: string }) {
  const t = useTranslations("outcomes");
  const [view, setView] = useState<View | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [message, setMessage] = useState("");
  const [causeFor, setCauseFor] = useState<Record<string, string>>({});
  const [distance, setDistance] = useState("");
  const [odometer, setOdometer] = useState({ start: "", end: "" });
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/trips/${tripId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => (response.ok ? setView(await response.json()) : setFailure(await readFailure(response))))
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: t("offline") }); });
    return () => controller.abort();
  }, [tripId, refresh, t]);

  async function post(action: string, body: unknown, success: string) {
    setFailure(null);
    setMessage("");
    const response = await fetch(`/api/trips/${tripId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!response?.ok) return setFailure(response ? await readFailure(response) : { message: t("offline") });
    setMessage(success);
    reload();
  }

  if (!view) return <main className="driver-page tp-page">{failure ? <SetupNotice failure={failure} /> : <div className="driver-loading" role="status">{t("loading")}</div>}</main>;
  const outcomeFor = (stopId: string) => view.outcomes.find((outcome) => outcome.itinerary_stop_id === stopId);
  const visited = view.stops.filter((stop) => stop.status !== "skipped" && stop.status !== "unavailable" || outcomeFor(stop.id)?.outcome && outcomeFor(stop.id)?.outcome !== "avoided");
  // Stops dropped because the business said it was unavailable or closed: candidates for "avoided".
  const swaps = (view.itinerary.metrics.swaps as Array<{ stop: string; from: string; reason: string }> | undefined) ?? [];
  const avoidable = view.stops.filter((stop) => stop.businessId && (stop.status === "unavailable" || ["UNAVAILABLE", "TEMPORARILY_CLOSED"].includes(stop.availability?.state ?? "")));
  const finished = view.itinerary.workflowState === "COMPLETED";

  return (
    <main className="driver-page tp-page">
      <Link href={`/app/trips/${tripId}`} className="driver-secondary tp-back">{t("back")}</Link>
      <h1>{t("title")}</h1>
      <p className="driver-small">{t("intro")}</p>
      {message && <p className="driver-message" role="status">{message}</p>}
      {failure && <SetupNotice failure={failure} />}

      <section className="tp-card">
        <h2>{t("stopsTitle")}</h2>
        <ul className="tp-list">
          {visited.map((stop) => {
            const recorded = outcomeFor(stop.id);
            return (
              <li key={stop.id} className="tp-action">
                <strong>{stop.errandLabel}</strong>
                <span className="driver-small">{stop.placeLabel}{recorded && ` · ${t(`outcome.${recorded.outcome}`)}${recorded.failure_cause ? ` (${t(`causes.${recorded.failure_cause}`)})` : ""}`}</span>
                <div className="driver-actions">
                  <button type="button" className="driver-primary" onClick={() => post("outcome", { stopId: stop.id, outcome: "success" }, t("saved"))}><CheckCircle aria-hidden="true" />{t("done")}</button>
                  <select aria-label={t("whyFailed")} value={causeFor[stop.id] ?? ""} onChange={(event) => setCauseFor({ ...causeFor, [stop.id]: event.target.value })}>
                    <option value="">{t("whyFailed")}</option>
                    {causes.map((cause) => <option key={cause} value={cause}>{t(`causes.${cause}`)}</option>)}
                  </select>
                  <button type="button" className="driver-secondary" disabled={!causeFor[stop.id]} onClick={() => post("outcome", { stopId: stop.id, outcome: "failed", cause: causeFor[stop.id] }, t("saved"))}>{t("failed")}</button>
                  <button type="button" className="driver-secondary" onClick={() => post("outcome", { stopId: stop.id, outcome: "skipped" }, t("saved"))}>{t("skipped")}</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="tp-card">
        <h2>{t("avoidedTitle")}</h2>
        <p className="driver-small">{t("avoidedIntro")}</p>
        {swaps.map((swap) => <p key={swap.stop} className="driver-small">{t("swapNote", { stop: swap.stop, place: swap.from })}</p>)}
        {!avoidable.length ? <p className="driver-empty">{t("noAvoidable")}</p> : (
          <ul className="tp-list">
            {avoidable.map((stop) => {
              const recorded = outcomeFor(stop.id);
              return (
                <li key={stop.id}>
                  <strong>{t("avoidedQuestion", { place: stop.placeLabel ?? stop.errandLabel })}</strong>
                  {recorded?.outcome === "avoided" ? (
                    <span className="driver-small">{t("avoidedRecorded", { km: Number(recorded.avoided_round_trip_km).toFixed(1), pkr: Math.round(Number(recorded.avoided_fuel_cost_pkr)), kind: t(`kinds.${recorded.avoided_estimate_kind ?? "straight_line"}`) })}</span>
                  ) : (
                    <div className="driver-actions">
                      <button type="button" className="driver-primary" onClick={() => post("outcome", { stopId: stop.id, outcome: "avoided" }, t("avoidedSaved"))}>{t("yesAvoided")}</button>
                      <button type="button" className="driver-secondary" onClick={() => post("outcome", { stopId: stop.id, outcome: "skipped", note: "would not have gone" }, t("saved"))}>{t("noNotAvoided")}</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="tp-card">
        <h2>{t("finishTitle")}</h2>
        {view.trip && <p className="driver-small">{t("planned", { km: Number(view.trip.planned_distance_km).toFixed(1) })}</p>}
        {finished ? <p className="driver-message">{t("finished")}</p> : (
          <>
            <div className="driver-form-grid">
              <label>{t("actualKm")}<input type="number" min={0} step={0.1} value={distance} onChange={(event) => setDistance(event.target.value)} /></label>
              <label>{t("odometerStart")}<input type="number" min={0} step={0.1} value={odometer.start} onChange={(event) => setOdometer({ ...odometer, start: event.target.value })} /></label>
              <label>{t("odometerEnd")}<input type="number" min={0} step={0.1} value={odometer.end} onChange={(event) => setOdometer({ ...odometer, end: event.target.value })} /></label>
            </div>
            <p className="driver-small">{t("actualOptional")}</p>
            <button type="button" className="driver-primary" onClick={() => post("finish", {
              ...(distance ? { actualDistanceKm: Number(distance) } : {}),
              ...(odometer.start && odometer.end ? { odometerStartKm: Number(odometer.start), odometerEndKm: Number(odometer.end) } : {}),
            }, t("finished"))}>{t("finish")}</button>
          </>
        )}
        <Link href="/app/trips/history" className="driver-secondary tp-back">{t("historyLink")}</Link>
      </section>
    </main>
  );
}
