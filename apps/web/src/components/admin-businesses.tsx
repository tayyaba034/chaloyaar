"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";
import "./trip-planner.css";

type Queue = {
  pending: Array<{ id: string; name: string; category: string; address: string | null; phone: string | null; created_at: string }>;
  claims: Array<{ id: string; claim_note: string | null; created_at: string; businesses: { name: string; category: string; address: string | null } | null; profiles: { display_name: string | null } | null }>;
  calls: Array<{ id: string; question: string; status: string; requested_at: string; businesses: { name: string; phone: string | null } | null }>;
};

// Admin review of new businesses, ownership claims and phone confirmations.
export function AdminBusinesses() {
  const t = useTranslations("adminBusinesses");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/businesses", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setFailure(await readFailure(response));
        setFailure(null);
        setQueue(await response.json());
      })
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: t("offline") }); });
    return () => controller.abort();
  }, [refresh, t]);

  async function act(body: unknown) {
    const response = await fetch("/api/admin/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!response?.ok) return setFailure(response ? await readFailure(response) : { message: t("offline") });
    setRefresh((value) => value + 1);
  }

  return (
    <div className="tp-page">
      <h1>{t("title")}</h1>
      {failure && <SetupNotice failure={failure} />}
      {!queue && !failure && <p role="status">{t("loading")}</p>}
      {queue && (
        <>
          <section className="tp-card">
            <h2>{t("pendingTitle", { count: queue.pending.length })}</h2>
            {!queue.pending.length && <p className="driver-small">{t("none")}</p>}
            <ul className="tp-list">
              {queue.pending.map((business) => (
                <li key={business.id}>
                  <strong>{business.name}</strong>
                  <span className="driver-small">{business.category} · {business.address ?? t("noAddress")} · {business.phone ?? t("noPhone")}</span>
                  <div className="driver-actions">
                    <button type="button" className="driver-primary" onClick={() => act({ kind: "review", businessId: business.id, decision: "active" })}>{t("approve")}</button>
                    <button type="button" className="driver-secondary" onClick={() => act({ kind: "review", businessId: business.id, decision: "rejected" })}>{t("reject")}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="tp-card">
            <h2>{t("claimsTitle", { count: queue.claims.length })}</h2>
            {!queue.claims.length && <p className="driver-small">{t("none")}</p>}
            <ul className="tp-list">
              {queue.claims.map((claim) => (
                <li key={claim.id}>
                  <strong>{claim.businesses?.name}</strong>
                  <span className="driver-small">{claim.profiles?.display_name ?? t("someone")}: “{claim.claim_note}”</span>
                  <div className="driver-actions">
                    <button type="button" className="driver-primary" onClick={() => act({ kind: "claim", membershipId: claim.id, approve: true })}>{t("approve")}</button>
                    <button type="button" className="driver-secondary" onClick={() => act({ kind: "claim", membershipId: claim.id, approve: false })}>{t("reject")}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="tp-card">
            <h2>{t("callsTitle", { count: queue.calls.length })}</h2>
            <p className="driver-small">{t("callsIntro")}</p>
            <ul className="tp-list">
              {queue.calls.map((call) => (
                <li key={call.id}>
                  <strong>{call.businesses?.name}</strong>
                  <span className="driver-small">{call.question} · {call.businesses?.phone ?? t("noPhone")} · {call.status}</span>
                  <input aria-label={t("callNote")} placeholder={t("callNote")} value={notes[call.id] ?? ""} maxLength={300} onChange={(event) => setNotes({ ...notes, [call.id]: event.target.value })} />
                  <div className="driver-actions">
                    {(["available", "unavailable", "no_answer"] as const).map((outcome) => (
                      <button key={outcome} type="button" className={outcome === "available" ? "driver-primary" : "driver-secondary"} disabled={(notes[call.id] ?? "").trim().length < 3}
                        onClick={() => act({ kind: "manual_confirmation", requestId: call.id, outcome, note: notes[call.id] })}>{t(`outcomes.${outcome}`)}</button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
