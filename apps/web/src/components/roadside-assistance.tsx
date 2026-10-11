"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  NavigationArrow,
  MagnifyingGlass,
  X,
  ArrowLeft,
} from "@phosphor-icons/react";
import { Link, useRouter } from "@/i18n/navigation";
import type { DriverVehicle } from "@/lib/driver-records";
import { driverMutation, useDriverResource } from "./use-driver-resource";

type RequestRecord = {
  id: string;
  service_type: string;
  status: string;
  notes: string | null;
  created_at: string;
  is_demo: boolean;
  quote_amount_pkr: number | null;
  assigned_provider_id: string | null;
};
type Quote = {
  id: string;
  provider_id: string;
  amount_pkr: number;
  verified_at: string;
  expires_at: string;
};
const services = [
  { value: "puncture", label: "Puncture / tyre help" },
  { value: "battery", label: "Battery jump-start" },
  { value: "towing", label: "Towing" },
];
const statusLabel = (status: string) =>
  status === "confirmed" ? "Accepted" : status.replaceAll("_", " ");

export function RoadsideAssistance({ requestId }: { requestId?: string }) {
  const history = useDriverResource<{ requests: RequestRecord[] }>(
    "/api/requests",
  );
  const detail = useDriverResource<{ request: RequestRecord }>(
    requestId ? `/api/requests/${requestId}` : null,
  );
  const vehicles = useDriverResource<{ vehicles: DriverVehicle[] }>(
    "/api/driver/vehicles",
  );
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [pickup, setPickup] = useState<Record<string, string> | null>(null);
  const [selected, setSelected] = useState("");
  const [sample, setSample] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => {
    if (!requestId) return;
    const timer = window.setInterval(detail.refresh, 15000);
    return () => window.clearInterval(timer);
  }, [requestId, detail.refresh]);
  function location() {
    if (!navigator.geolocation) {
      setMessage("Location is unavailable. Enter pickup coordinates instead.");
      return;
    }
    setMessage("Looking up your location...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const form = formRef.current;
        if (form) {
          (form.elements.namedItem("latitude") as HTMLInputElement).value =
            String(coords.latitude);
          (form.elements.namedItem("longitude") as HTMLInputElement).value =
            String(coords.longitude);
        }
        setQuotes(null);
        setPickup(null);
        setMessage(
          "Pickup coordinates filled. Review them before checking quotes.",
        );
      },
      () =>
        setMessage(
          "Location permission failed. Enter pickup coordinates instead.",
        ),
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  async function checkQuotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setQuotes(null);
    setSelected("");
    const fields = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    try {
      const result = await driverMutation<{
        quotes: Quote[];
        limitation?: string;
      }>(
        `/api/requests/quotes?${new URLSearchParams({ service: fields.serviceType, lat: fields.latitude, lng: fields.longitude })}`,
        "GET",
      );
      setPickup(fields);
      setQuotes(result.quotes);
      if (!result.quotes.length)
        setMessage(
          result.limitation ??
            "No verified provider quote is available for this pickup. No request was sent.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Quotes could not be checked. No request was sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pickup || !selected) return;
    setBusy(true);
    setMessage("");
    const contact = new FormData(event.currentTarget);
    try {
      const result = await driverMutation<{ request: RequestRecord }>(
        "/api/requests",
        "POST",
        {
          ...pickup,
          latitude: Number(pickup.latitude),
          longitude: Number(pickup.longitude),
          quoteId: selected,
          confirmedQuote: contact.get("confirm") === "on",
          contactPhone: contact.get("contactPhone"),
        },
      );
      router.push(`/app/help/${result.request.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Request could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!requestId) return;
    setBusy(true);
    try {
      await driverMutation(`/api/requests/${requestId}`, "POST");
      detail.refresh();
      history.refresh();
      setConfirmCancel(false);
      setMessage("Request cancelled.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Cancellation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const request = detail.data?.request;
  const quote = quotes?.find((item) => item.id === selected);
  return (
    <main className="dashboard-page">
      <header className="driver-page-heading">
        <div>
          <h1>Get Help</h1>
          <p>
            Tyre assistance, battery jump-start, and towing. Fuel delivery is
            not offered.
          </p>
        </div>
      </header>
      {message && (
        <p className="driver-message" role="status">
          {message}
        </p>
      )}
      {requestId ? (
        <section className="driver-section">
          <Link href="/app/help">
            <ArrowLeft /> All requests
          </Link>
          {detail.loading && !request && (
            <p role="status">Loading request...</p>
          )}
          {detail.error && (
            <p className="driver-error" role="alert">
              {detail.error}
              <button onClick={detail.refresh}>Retry</button>
            </p>
          )}
          {request && (
            <>
              <h2>
                {services.find((item) => item.value === request.service_type)
                  ?.label ?? request.service_type}
              </h2>
              <p className="driver-status">{statusLabel(request.status)}</p>
              <p>{new Date(request.created_at).toLocaleString()}</p>
              {request.is_demo && (
                <span className="demo-badge">
                  Demo request, not a live dispatch
                </span>
              )}
              <p>{request.notes}</p>
              <p>
                Quote:{" "}
                {request.quote_amount_pkr == null
                  ? "No recorded quote"
                  : `PKR ${Number(request.quote_amount_pkr).toLocaleString()}`}
              </p>
              <p>
                Provider reference:{" "}
                {request.assigned_provider_id ?? "Not assigned"}
              </p>
              {["requested", "confirmed"].includes(request.status) &&
                (confirmCancel ? (
                  <div className="driver-confirm">
                    <p>Cancel this request?</p>
                    <button
                      className="driver-secondary"
                      disabled={busy}
                      onClick={() => setConfirmCancel(false)}
                    >
                      Keep request
                    </button>
                    <button
                      className="driver-primary"
                      disabled={busy}
                      onClick={cancel}
                    >
                      <X />
                      Confirm cancellation
                    </button>
                  </div>
                ) : (
                  <button
                    className="driver-secondary"
                    onClick={() => setConfirmCancel(true)}
                  >
                    <X />
                    Cancel request
                  </button>
                ))}
            </>
          )}
        </section>
      ) : (
        <>
          <section className="driver-section">
            <h2>Find a verified quote</h2>
            <p>
              Only a current quote from an approved provider can be submitted.
              Availability and arrival times are not guaranteed.
            </p>
            <form
              ref={formRef}
              onSubmit={checkQuotes}
              onChange={() => {
                setQuotes(null);
                setPickup(null);
              }}
            >
              <div className="driver-form-grid">
                <label>
                  Service
                  <select name="serviceType">
                    {services.map((service) => (
                      <option key={service.value} value={service.value}>
                        {service.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Vehicle (optional)
                  <select
                    name="vehicleId"
                    disabled={vehicles.loading || !!vehicles.error}
                  >
                    <option value="">No vehicle selected</option>
                    {vehicles.data?.vehicles.map((vehicle) => (
                      <option value={vehicle.id} key={vehicle.id}>
                        {vehicle.nickname}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Pickup latitude
                  <input
                    name="latitude"
                    type="number"
                    min={-90}
                    max={90}
                    step="any"
                    required
                  />
                </label>
                <label>
                  Pickup longitude
                  <input
                    name="longitude"
                    type="number"
                    min={-180}
                    max={180}
                    step="any"
                    required
                  />
                </label>
                <label>
                  Useful details (optional)
                  <textarea name="notes" maxLength={500} />
                </label>
              </div>
              {vehicles.error && (
                <p role="alert">
                  {vehicles.error}
                  <button type="button" onClick={vehicles.refresh}>
                    Retry vehicles
                  </button>
                </p>
              )}
              <div className="driver-actions">
                <button
                  type="button"
                  className="driver-secondary"
                  onClick={location}
                >
                  <NavigationArrow />
                  Use current location
                </button>
                <button className="driver-primary" disabled={busy}>
                  <MagnifyingGlass />
                  {busy ? "Checking..." : "Check quotes"}
                </button>
              </div>
            </form>
          </section>
          {!!quotes?.length && (
            <section className="driver-section">
              <h2>Review a verified quote</h2>
              <form onSubmit={send}>
                <label>
                  Provider / quote
                  <select
                    required
                    value={selected}
                    onChange={(event) => setSelected(event.target.value)}
                  >
                    <option value="">Choose a quote</option>
                    {quotes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.provider_id} / PKR{" "}
                        {Number(item.amount_pkr).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </label>
                {quote && (
                  <>
                    <p>
                      PKR {Number(quote.amount_pkr).toLocaleString()} / Verified{" "}
                      {new Date(quote.verified_at).toLocaleString()} / Expires{" "}
                      {new Date(quote.expires_at).toLocaleString()}
                    </p>
                    <label>
                      Contact phone
                      <input
                        name="contactPhone"
                        type="tel"
                        required
                        minLength={7}
                        maxLength={30}
                      />
                    </label>
                    <label className="driver-preference">
                      <span>
                        I reviewed this quote and agree to share my pickup and
                        contact details for this request.
                      </span>
                      <input name="confirm" type="checkbox" required />
                    </label>
                    <button className="driver-primary" disabled={busy}>
                      <Check />
                      {busy ? "Submitting..." : "Confirm and request help"}
                    </button>
                  </>
                )}
              </form>
            </section>
          )}
          <section className="driver-section">
            <h2>Sample walkthrough</h2>
            <p>
              No verified quote? This local sample demonstrates statuses only.
              No provider, price, arrival time, or dispatch is simulated as
              real.
            </p>
            {!sample ? (
              <button
                className="driver-secondary"
                onClick={() => setSample("review")}
              >
                Preview sample workflow
              </button>
            ) : (
              <div className="driver-confirm">
                <strong>Sample only: {sample}</strong>
                {sample === "review" ? (
                  <>
                    <p>
                      No real quote is available in this preview. Confirm to
                      continue the sample, not to request a service.
                    </p>
                    <button
                      className="driver-secondary"
                      onClick={() => setSample("requested")}
                    >
                      Confirm sample review
                    </button>
                  </>
                ) : (
                  !["completed", "cancelled"].includes(sample) && (
                    <button
                      className="driver-secondary"
                      onClick={() =>
                        setSample(
                          sample === "requested"
                            ? "accepted"
                            : sample === "accepted"
                              ? "en route"
                              : "completed",
                        )
                      }
                    >
                      Advance sample status
                    </button>
                  )
                )}
                <button
                  className="driver-secondary"
                  onClick={() =>
                    setSample(
                      sample === "cancelled" || sample === "completed"
                        ? null
                        : "cancelled",
                    )
                  }
                >
                  {["completed", "cancelled"].includes(sample)
                    ? "Close sample"
                    : "Cancel sample"}
                </button>
              </div>
            )}
          </section>
        </>
      )}
      <section className="driver-section">
        <h2>Request history</h2>
        {history.loading && <p role="status">Loading requests...</p>}
        {history.error && (
          <p role="alert">
            {history.error}
            <button onClick={history.refresh}>Retry</button>
          </p>
        )}
        {!history.loading &&
          !history.error &&
          !history.data?.requests.length && <p>No roadside requests yet.</p>}
        <div className="driver-record-list">
          {history.data?.requests.map((item) => (
            <article className="driver-record" key={item.id}>
              <Link href={`/app/help/${item.id}`}>
                {services.find((service) => service.value === item.service_type)
                  ?.label ?? item.service_type}
              </Link>
              <p>
                {statusLabel(item.status)} /{" "}
                {new Date(item.created_at).toLocaleDateString()}
              </p>
              {item.is_demo && <span className="demo-badge">Demo request</span>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
