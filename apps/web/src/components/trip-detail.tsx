"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowsClockwise, ArrowUp, ChatCircleDots, CheckCircle, MapTrifold, Play, Plus, Trash, XCircle } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { AvailabilityBadge, AvailabilityLegend, type AvailabilityView } from "./availability-badge";
import { PlaceSearch, placeName } from "./place-search";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";
import { TrueCostMap } from "./truecost-map";
import "./trip-planner.css";

type Stop = {
  id: string; position: number; userPosition: number; errandLabel: string; category: string | null; businessId: string | null; placeLabel: string | null;
  latitude: number | null; longitude: number | null; mandatory: boolean; deadlineAt: string | null; deadlineKind: "hard" | "soft"; serviceMinutes: number;
  status: string; plannedArrivalAt: string | null; plannedDepartureAt: string | null;
  availability: { state: AvailabilityView["state"]; until: string | null; source: string | null } | null;
};
type Action = { id: string; action_type: string; summary: string; status: string; proposed_by: string; result: Record<string, unknown> | null; payload: Record<string, unknown> };
type Step = { id: string; step: string; status: string; actor: string; from_state: string | null; to_state: string | null; output_summary: Record<string, unknown>; error: string | null; started_at: string };
type View = {
  itinerary: {
    id: string; workflowState: string; requestText: string | null; originLabel: string | null; originLatitude: number | null; originLongitude: number | null;
    returnToOrigin: boolean; departAt: string | null; kmPerLitre: number | null; pricePkrPerLitre: number | null; maxTripMinutes: number | null;
    preferredMaxCostPkr: number | null; weights: Record<string, unknown>; metrics: Record<string, unknown>; needsRecalculation: boolean; isDemo: boolean;
  };
  stops: Stop[];
  steps: Step[];
  actions: Action[];
  revisions: Array<{ revision: number; reason: string; created_at: string }>;
  trip: { id: string; status: string } | null;
  navigationUrl: string | null;
};
type Diagnosis = { summary: string; suggestions: Array<{ change: string; stopId?: string; resultingCostPkr: number }> };

const pkr = (value: unknown) => (typeof value === "number" ? `Rs ${Math.round(value).toLocaleString("en-PK")}` : "—");
const km = (value: unknown) => (typeof value === "number" ? `${value.toFixed(1)} km` : "—");
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PK", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit" }) : "—");
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 16) : "");
const fromLocalInput = (value: string) => (value ? new Date(`${value}:00+05:00`).toISOString() : null);

export function TripDetail({ tripId }: { tripId: string }) {
  const t = useTranslations("trips");
  const [view, setView] = useState<View | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionFailure, setActionFailure] = useState<ApiFailure | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [showSteps, setShowSteps] = useState(false);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/trips/${tripId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setFailure(await readFailure(response));
        setFailure(null);
        setView(await response.json());
      })
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: t("offline") }); });
    const timer = window.setInterval(reload, 20000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [tripId, refresh, t, reload]);

  async function call(path: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") {
    if (busy) return;
    setBusy(true);
    setActionFailure(null);
    try {
      const response = await fetch(`/api/trips/${tripId}${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "DELETE" ? undefined : JSON.stringify(body) });
      if (!response.ok) setActionFailure(await readFailure(response));
    } catch {
      setActionFailure({ message: t("offline") });
    } finally {
      setBusy(false);
      reload();
    }
  }

  const planned = useMemo(() => (view?.stops ?? []).filter((stop) => stop.status === "planned" || stop.status === "visited").sort((a, b) => a.position - b.position), [view]);
  const markers = useMemo(() => planned.filter((stop) => stop.latitude !== null).map((stop, index) => ({
    name: `${index + 1}. ${stop.placeLabel ?? stop.errandLabel}`, latitude: stop.latitude!, longitude: stop.longitude!,
    warning: stop.availability && stop.availability.state !== "CONFIRMED" ? t("unconfirmedMarker") : undefined,
  })), [planned, t]);
  const routeLine = useMemo(() => {
    if (!view?.itinerary.originLatitude) return null;
    const originPoint = [view.itinerary.originLongitude!, view.itinerary.originLatitude!];
    const points = [originPoint, ...planned.filter((stop) => stop.latitude !== null).map((stop) => [stop.longitude!, stop.latitude!])];
    if (view.itinerary.returnToOrigin) points.push(originPoint);
    return points.length > 1 ? { type: "LineString" as const, coordinates: points } : null;
  }, [view, planned]);
  const userLocation = useMemo(() => (view?.itinerary.originLatitude ? { latitude: view.itinerary.originLatitude, longitude: view.itinerary.originLongitude! } : null), [view]);

  if (failure) return <main className="driver-page tp-page"><SetupNotice failure={failure} /><Link href="/app/trips" className="driver-secondary tp-back">{t("back")}</Link></main>;
  if (!view) return <main className="driver-page tp-page"><div className="driver-loading" role="status">{t("loading")}</div></main>;
  const { itinerary } = view;
  const metrics = itinerary.metrics;
  const state = itinerary.workflowState;
  const editable = !["COMPLETED", "CANCELLED"].includes(state);
  const proposedActions = view.actions.filter((action) => action.status === "proposed");
  const commit = proposedActions.find((action) => action.action_type === "commit_trip");
  const uncertain = (metrics.uncertainStops as string[] | undefined) ?? [];
  const comparison = metrics.comparison as { originalDistanceKm: number; originalTotalPkr: number; originalFeasible: boolean; savingsPkr: number | null; savingsKm: number; originalOrder: string[] } | null | undefined;
  const objective = metrics.objective as Record<string, number> | undefined;
  const alternatives = (metrics.alternatives ?? {}) as Record<string, Array<{ id: string; name: string; distanceKm: number | null; state: AvailabilityView["state"]; isDemo: boolean }>>;
  const userOrdered = [...(view.stops ?? [])].filter((stop) => stop.status !== "skipped" && stop.status !== "unavailable").sort((a, b) => a.userPosition - b.userPosition);

  return (
    <main className="driver-page tp-page">
      <Link href="/app/trips" className="driver-secondary tp-back">{t("back")}</Link>
      <div className="driver-page-heading">
        <div>
          <h1>{t("planTitle")}</h1>
          <p className="driver-small">“{itinerary.requestText}”</p>
          <p className="tp-state"><span className={`tp-state-chip tp-state-chip--${state.toLowerCase()}`}>{t(`states.${state}`)}</span> {busy && <span className="driver-small" role="status">{t("working")}</span>}</p>
        </div>
      </div>
      {itinerary.isDemo && <p className="driver-message">{t("demoTrip")}</p>}
      {actionFailure && <SetupNotice failure={actionFailure} />}
      {itinerary.needsRecalculation && editable && (
        <div className="driver-message driver-error" role="status">
          <span>{t("needsRecalc", { reason: String(metrics.recalculationReason ?? "") })}</span>
          <button type="button" className="driver-primary" onClick={() => call("/recalculate", {})}><ArrowsClockwise aria-hidden="true" />{t("recalculate")}</button>
        </div>
      )}
      {state === "FAILED" && <div className="driver-message driver-error"><span>{t("failed")}</span><button type="button" className="driver-primary" onClick={() => call("/retry", {})}>{t("retry")}</button></div>}

      {state === "NEEDS_INFO" && <Questions view={view} onCall={call} />}

      <section className="tp-card">
        <div className="tp-section-head">
          <h2>{t("stopsTitle")}</h2>
          <AvailabilityLegend />
        </div>
        <ol className="tp-stops">
          {planned.map((stop, index) => (
            <li key={stop.id} className="tp-stop">
              <span className="tp-stop-number">{index + 1}</span>
              <div className="tp-stop-body">
                <strong>{stop.errandLabel}</strong>
                <span>{stop.placeLabel ?? t("noBusinessYet")}{stop.businessId && <Link href={`/app/places/${stop.businessId}`} className="driver-small"> · {t("details")}</Link>}</span>
                {stop.availability ? <AvailabilityBadge availability={{ ...stop.availability, submittedAt: null }} /> : stop.latitude !== null && <span className="driver-small">{t("customPlace")}</span>}
                <span className="driver-small">
                  {t("arrive", { time: clock(stop.plannedArrivalAt) })}
                  {stop.deadlineAt && ` · ${t(stop.deadlineKind === "hard" ? "hardDeadline" : "softDeadline", { time: clock(stop.deadlineAt) })}`}
                  {!stop.mandatory && ` · ${t("optional")}`}
                </span>
                {editable && <StopEditor stop={stop} alternatives={alternatives[stop.id] ?? []} onCall={call} />}
              </div>
            </li>
          ))}
        </ol>
        {view.stops.filter((stop) => stop.status === "skipped" || stop.status === "unavailable").length > 0 && (
          <p className="driver-small">{t("skippedStops", { stops: view.stops.filter((stop) => stop.status === "skipped" || stop.status === "unavailable").map((stop) => stop.errandLabel).join(", ") })}</p>
        )}
        {((metrics.swaps as Array<{ stop: string; from: string; to: string }> | undefined) ?? []).map((swap) => (
          <p key={swap.stop} className="driver-small">{t("swapped", { stop: swap.stop, from: swap.from, to: swap.to })}</p>
        ))}
        {editable && <AddStop onCall={call} />}
      </section>

      {typeof metrics.distanceKm === "number" && (
        <section className="tp-card">
          <h2>{t("summaryTitle")}</h2>
          <div className="driver-stats">
            <div><span>{t("distance")}</span><strong>{km(metrics.distanceKm)}</strong></div>
            <div><span>{t("time")}</span><strong>{t("minutes", { minutes: Math.round(Number(metrics.totalMinutes)) })}</strong></div>
            <div><span>{t("fuelUsed")}</span><strong>{`${Number(metrics.fuelLitres).toFixed(2)} L`}</strong></div>
            <div><span>{t("fuelCost")}</span><strong>{pkr(metrics.fuelCostPkr)}</strong></div>
          </div>
          {metrics.overPreferredCost === true && <p className="driver-message driver-error">{t("overBudget", { budget: pkr(itinerary.preferredMaxCostPkr) })}</p>}
          {comparison && (
            <div className="tp-compare">
              <div><strong>{t("yourOrder")}</strong><span>{km(comparison.originalDistanceKm)} · {comparison.originalFeasible ? pkr(comparison.originalTotalPkr) : t("orderBreaksLimit")}</span></div>
              <div><strong>{t("optimisedOrder")}</strong><span>{km(metrics.distanceKm)} · {pkr(objective?.totalPkr)}</span></div>
              <p className="driver-small">{comparison.savingsPkr !== null && comparison.savingsPkr > 0 ? t("saves", { pkr: pkr(comparison.savingsPkr), km: km(comparison.savingsKm) }) : t("sameAsYours")}</p>
            </div>
          )}
          <UserOrder stops={userOrdered} keep={itinerary.weights.keepUserOrder === true} disabled={!editable} onCall={call} />
          <div className="tp-map">
            <TrueCostMap center={userLocation ?? undefined} markers={markers} userLocation={userLocation} routeGeometry={routeLine} routeDashed />
            <p className="driver-small">{t("mapLinesNote")}</p>
          </div>
          <RouteLab metrics={metrics} />
        </section>
      )}

      <section className="tp-card">
        <h2>{t("approvalsTitle")}</h2>
        <p className="driver-small">{t("approvalsIntro")}</p>
        {!view.actions.length && <p className="driver-empty">{t("noActions")}</p>}
        <ul className="tp-list">
          {view.actions.filter((action) => action.action_type !== "commit_trip").map((action) => (
            <li key={action.id} className="tp-action">
              <span>{action.summary} <span className="driver-small">· {t(`actionStatus.${action.status}`)}{action.proposed_by === "agent" ? ` · ${t("proposedByAi")}` : ""}</span></span>
              {action.status === "executed" && action.result && typeof action.result.status === "string" && <span className="driver-small">{t(`requestResult.${action.result.status}`)}{typeof action.result.failure === "string" ? ` – ${action.result.failure}` : ""}</span>}
              {action.status === "proposed" && (
                <div className="driver-actions">
                  <button type="button" className="driver-primary" onClick={() => call("/decide", { actionId: action.id, decision: "approve" })}><CheckCircle aria-hidden="true" />{t("approveSend")}</button>
                  <button type="button" className="driver-secondary" onClick={() => call("/decide", { actionId: action.id, decision: "reject" })}><XCircle aria-hidden="true" />{t("reject")}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {commit && state === "AWAITING_APPROVAL" && <CommitPlan uncertain={uncertain} onApprove={(acknowledgeRisk) => call("/decide", { actionId: commit.id, decision: "approve", acknowledgeRisk })} />}
        {(state === "APPROVED" || state === "IN_PROGRESS") && (
          <div className="tp-approved">
            <p className="driver-message">{t(state === "APPROVED" ? "approved" : "inProgress")}</p>
            <div className="driver-actions">
              {view.navigationUrl && <a className="driver-primary" href={view.navigationUrl} target="_blank" rel="noreferrer"><MapTrifold aria-hidden="true" />{t("navigate")}</a>}
              {state === "APPROVED" && <button type="button" className="driver-secondary" onClick={() => call("/start", {})}><Play aria-hidden="true" />{t("startTrip")}</button>}
              <Link className="driver-secondary" href={`/app/trips/${tripId}/outcome`}>{t("recordOutcome")}</Link>
            </div>
            <p className="driver-small">{t("navigateNote")}</p>
          </div>
        )}
        {editable && state !== "APPROVED" && state !== "IN_PROGRESS" && <button type="button" className="driver-secondary tp-back" onClick={() => call("", {}, "DELETE")}>{t("cancelTrip")}</button>}
      </section>

      <PlannerChat tripId={tripId} onDone={reload} />

      <section className="tp-card">
        <button type="button" className="driver-secondary tp-back" aria-expanded={showSteps} onClick={() => setShowSteps(!showSteps)}>{showSteps ? t("hideSteps") : t("showSteps", { count: view.steps.length })}</button>
        {showSteps && (
          <ol className="tp-steps" aria-label={t("inspector")}>
            {view.steps.map((step) => (
              <li key={step.id}>
                <span className={`tp-step tp-step--${step.status}`}>{t(`stepNames.${step.step}`)}</span>
                <span className="driver-small">{step.from_state} → {step.to_state} · {t(`actors.${step.actor}`)} · {new Date(step.started_at).toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi" })}</span>
                <code className="tp-step-output" lang="en" dir="ltr">{JSON.stringify(step.output_summary)}</code>
                {step.error && <span className="driver-small">{step.error}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

type Call = (path: string, body: unknown, method?: "POST" | "PATCH" | "DELETE") => Promise<void>;

function Questions({ view, onCall }: { view: View; onCall: Call }) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const questions = (view.itinerary.metrics.questions as Array<{ key: string; label?: string; stopId?: string }> | undefined) ?? [];
  const diagnosis = view.itinerary.metrics.diagnosis as Diagnosis | null | undefined;
  const [efficiency, setEfficiency] = useState(String(view.itinerary.kmPerLitre ?? ""));
  const [price, setPrice] = useState(String(view.itinerary.pricePkrPerLitre ?? ""));
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number; label: string } | null>(null);
  const keys = new Set(questions.map((question) => question.key));
  return (
    <section className="tp-card tp-questions">
      <h2>{t("questionsTitle")}</h2>
      {keys.has("errands") && <p>{t("questions.errands")}</p>}
      {keys.has("origin") && <PlaceSearch label={t("questions.origin")} onSelect={(place) => setOrigin({ latitude: place.latitude, longitude: place.longitude, label: placeName(place, locale) })} />}
      {keys.has("efficiency") && <label>{t("questions.efficiency")}<input type="number" min={1} max={200} step={0.1} value={efficiency} onChange={(event) => setEfficiency(event.target.value)} /></label>}
      {keys.has("fuel_price") && <label>{t("questions.fuel_price")}<input type="number" min={1} max={5000} step={0.01} value={price} onChange={(event) => setPrice(event.target.value)} /></label>}
      {(keys.has("origin") || keys.has("efficiency") || keys.has("fuel_price")) && (
        <button type="button" className="driver-primary" onClick={() => onCall("", {
          ...(origin ? { origin } : {}), ...(Number(efficiency) > 0 ? { kmPerLitre: Number(efficiency) } : {}), ...(Number(price) > 0 ? { pricePkrPerLitre: Number(price) } : {}),
        }, "PATCH")}>{t("continue")}</button>
      )}
      {questions.filter((question) => question.key === "no_candidate").map((question) => (
        <div key={question.stopId} className="tp-question">
          <p>{t("questions.no_candidate", { errand: question.label ?? "" })}</p>
          <div className="driver-actions">
            <button type="button" className="driver-secondary" onClick={() => onCall("/stops", { op: "edit", stopId: question.stopId, mandatory: false })}>{t("makeOptional")}</button>
            <button type="button" className="driver-secondary" onClick={() => onCall("/stops", { op: "remove", stopId: question.stopId })}>{t("removeStop")}</button>
            <Link className="driver-secondary" href="/app/places">{t("findManually")}</Link>
          </div>
        </div>
      ))}
      {keys.has("infeasible") && diagnosis && (
        <div className="tp-question">
          <p><strong>{t("infeasibleTitle")}</strong> {diagnosis.summary}</p>
          <p className="driver-small">{t("infeasibleIntro")}</p>
          <div className="driver-actions">
            {diagnosis.suggestions.map((suggestion, index) => (
              <button key={index} type="button" className="driver-secondary" onClick={() => {
                if (suggestion.change === "drop_max_duration") return onCall("", { maxTripMinutes: null }, "PATCH");
                if (suggestion.change === "make_optional") return onCall("/stops", { op: "edit", stopId: suggestion.stopId, mandatory: false });
                if (suggestion.change === "relax_hard_deadline") return onCall("/stops", { op: "edit", stopId: suggestion.stopId, deadlineKind: "soft" });
                return onCall("/stops", { op: "remove", stopId: suggestion.stopId });
              }}>{t(`suggestions.${suggestion.change}`, { stop: view.stops.find((stop) => stop.id === suggestion.stopId)?.errandLabel ?? "" })} ({pkr(suggestion.resultingCostPkr)})</button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StopEditor({ stop, alternatives, onCall }: { stop: Stop; alternatives: Array<{ id: string; name: string; distanceKm: number | null; state: AvailabilityView["state"]; isDemo: boolean }>; onCall: Call }) {
  const t = useTranslations("trips");
  const availabilityT = useTranslations("availability");
  const [open, setOpen] = useState(false);
  const [deadline, setDeadline] = useState(toLocalInput(stop.deadlineAt));
  if (!open) return <button type="button" className="tp-link-button" onClick={() => setOpen(true)}>{t("editStop")}</button>;
  return (
    <div className="tp-stop-editor">
      <label className="driver-check"><input type="checkbox" checked={stop.mandatory} onChange={(event) => onCall("/stops", { op: "edit", stopId: stop.id, mandatory: event.target.checked })} />{t("mandatory")}</label>
      <label>{t("deadline")}<input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
      <div className="driver-actions">
        <button type="button" className="driver-secondary" onClick={() => onCall("/stops", { op: "edit", stopId: stop.id, deadlineAt: fromLocalInput(deadline), deadlineKind: "soft" })}>{t("setSoftDeadline")}</button>
        <button type="button" className="driver-secondary" onClick={() => onCall("/stops", { op: "edit", stopId: stop.id, deadlineAt: fromLocalInput(deadline), deadlineKind: "hard" })}>{t("setHardDeadline")}</button>
      </div>
      {alternatives.filter((alternative) => alternative.id !== stop.businessId).length > 0 && (
        <label>{t("chooseAlternative")}
          <select value="" onChange={(event) => event.target.value && onCall("/stops", { op: "edit", stopId: stop.id, businessId: event.target.value })}>
            <option value="">—</option>
            {alternatives.filter((alternative) => alternative.id !== stop.businessId).map((alternative) => (
              <option key={alternative.id} value={alternative.id}>{alternative.name}{alternative.isDemo ? ` (${t("demo")})` : ""} · {availabilityT(`states.${alternative.state}.label`)}{alternative.distanceKm !== null ? ` · ${alternative.distanceKm.toFixed(1)} km` : ""}</option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className="driver-secondary" onClick={() => onCall("/stops", { op: "remove", stopId: stop.id })}><Trash aria-hidden="true" />{t("removeStop")}</button>
    </div>
  );
}

function AddStop({ onCall }: { onCall: Call }) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const [label, setLabel] = useState("");
  const [place, setPlace] = useState<{ latitude: number; longitude: number; label: string } | null>(null);
  const [mandatory, setMandatory] = useState(true);
  return (
    <details className="tp-add-stop">
      <summary><Plus aria-hidden="true" /> {t("addStop")}</summary>
      <label>{t("errandName")}<input value={label} maxLength={120} placeholder={t("errandPlaceholder")} onChange={(event) => setLabel(event.target.value)} /></label>
      <PlaceSearch label={t("orExactPlace")} onSelect={(option) => setPlace({ latitude: option.latitude, longitude: option.longitude, label: placeName(option, locale) })} />
      {place && <p className="driver-small">{t("exactPlace", { place: place.label })}</p>}
      <label className="driver-check"><input type="checkbox" checked={mandatory} onChange={(event) => setMandatory(event.target.checked)} />{t("mandatory")}</label>
      <button type="button" className="driver-primary" disabled={label.trim().length < 2} onClick={() => { void onCall("/stops", { op: "add", label, serviceQuery: label, mandatory, ...(place ? { place } : {}) }); setLabel(""); setPlace(null); }}>{t("addStop")}</button>
    </details>
  );
}

function UserOrder({ stops, keep, disabled, onCall }: { stops: Stop[]; keep: boolean; disabled: boolean; onCall: Call }) {
  const t = useTranslations("trips");
  const move = (index: number, delta: number) => {
    const ids = stops.map((stop) => stop.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    void onCall("/stops", { op: "reorder", stopIds: ids });
  };
  return (
    <details className="tp-user-order">
      <summary>{t("yourOrderTitle")}</summary>
      <p className="driver-small">{t("yourOrderIntro")}</p>
      <ol>
        {stops.map((stop, index) => (
          <li key={stop.id}>
            <span>{stop.errandLabel}</span>
            <button type="button" className="tp-icon" disabled={disabled || index === 0} aria-label={t("moveUp", { stop: stop.errandLabel })} onClick={() => move(index, -1)}><ArrowUp /></button>
            <button type="button" className="tp-icon" disabled={disabled || index === stops.length - 1} aria-label={t("moveDown", { stop: stop.errandLabel })} onClick={() => move(index, 1)}><ArrowDown /></button>
          </li>
        ))}
      </ol>
      <label className="driver-check"><input type="checkbox" checked={keep} disabled={disabled} onChange={(event) => onCall("", { keepUserOrder: event.target.checked }, "PATCH")} />{t("keepMyOrder")}</label>
    </details>
  );
}

function RouteLab({ metrics }: { metrics: Record<string, unknown> }) {
  const t = useTranslations("trips");
  const routing = metrics.routing as { estimateKind: string; providers: string[]; engine: string; notes: string[]; engineNote: string | null } | undefined;
  const objective = metrics.objective as Record<string, number> | undefined;
  const sensitivity = metrics.sensitivity as Array<{ label: string; fuelCostPkr: number; changePkr: number }> | undefined;
  return (
    <details className="tp-route-lab">
      <summary>{t("routeLab")}</summary>
      <dl>
        <div><dt>{t("lab.distances")}</dt><dd>{t(`lab.estimate.${routing?.estimateKind ?? "straight_line"}`)} ({(routing?.providers ?? []).join(", ")})</dd></div>
        <div><dt>{t("lab.engine")}</dt><dd>{t(`lab.engines.${String(metrics.engine ?? "in_process")}`)}{routing?.engineNote ? ` · ${t("lab.fallback")}` : ""}</dd></div>
        <div><dt>{t("lab.solver")}</dt><dd>{t(`lab.optimality.${String(metrics.optimality ?? "best_found")}`)}</dd></div>
        {objective && (
          <div><dt>{t("lab.objective")}</dt><dd>{t("lab.objectiveParts", {
            fuel: pkr(objective.fuelCostPkr), time: pkr(objective.timeCostPkr), failed: pkr(objective.failedVisitPenaltyPkr),
            deadline: pkr(objective.missedDeadlinePenaltyPkr), skip: pkr(objective.skipPenaltyPkr), total: pkr(objective.totalPkr),
          })}</dd></div>
        )}
      </dl>
      <p className="driver-small">{t("lab.formula")}</p>
      {sensitivity && <ul className="tp-list">{sensitivity.map((row) => <li key={row.label} className="driver-small">{row.label}: {pkr(row.fuelCostPkr)} ({row.changePkr >= 0 ? "+" : ""}{Math.round(row.changePkr)})</li>)}</ul>}
      <ul className="tp-list">{((metrics.assumptions as string[] | undefined) ?? []).map((assumption) => <li key={assumption} className="driver-small" lang="en" dir="ltr">{assumption}</li>)}</ul>
      {(routing?.notes ?? []).includes("road_routing_not_configured") && <p className="driver-small">{t("lab.noRouting")}</p>}
    </details>
  );
}

function CommitPlan({ uncertain, onApprove }: { uncertain: string[]; onApprove: (acknowledgeRisk: boolean) => void }) {
  const t = useTranslations("trips");
  const [accepted, setAccepted] = useState(false);
  return (
    <div className="tp-commit">
      {uncertain.length > 0 && (
        <div className="driver-message driver-error">
          <span>{t("riskWarning", { stops: uncertain.join(", ") })}</span>
          <label className="driver-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />{t("acceptRisk")}</label>
        </div>
      )}
      <button type="button" className="driver-primary" disabled={uncertain.length > 0 && !accepted} onClick={() => onApprove(accepted)}><CheckCircle aria-hidden="true" />{t("approvePlan")}</button>
    </div>
  );
}

function PlannerChat({ tripId, onDone }: { tripId: string; onDone: () => void }) {
  const t = useTranslations("trips");
  const locale = useLocale();
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<{ text: string; tools: string[]; provider: string } | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  async function ask() {
    if (busy || !message.trim()) return;
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch(`/api/trips/${tripId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, locale }) });
      if (!response.ok) return setFailure(await readFailure(response));
      const body = await response.json();
      setAnswer({ text: body.answer, tools: body.toolsUsed, provider: body.provider });
      onDone();
    } catch {
      setFailure({ message: t("offline") });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tp-card">
      <h2><ChatCircleDots aria-hidden="true" /> {t("chatTitle")}</h2>
      <p className="driver-small">{t("chatIntro")}</p>
      <div className="bd-inline">
        <input value={message} maxLength={500} placeholder={t("chatPlaceholder")} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === "Enter" && ask()} />
        <button type="button" className="driver-primary" disabled={busy || !message.trim()} onClick={ask}>{busy ? t("thinking") : t("ask")}</button>
      </div>
      {failure && <SetupNotice failure={failure} />}
      {answer && (
        <div className="tp-answer">
          <p>{answer.text}</p>
          <p className="driver-small">{t("chatSources", { provider: answer.provider, tools: answer.tools.join(", ") || "—" })}</p>
        </div>
      )}
    </section>
  );
}
