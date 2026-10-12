"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Crosshair, House, MapPin, Trash } from "@phosphor-icons/react";
import { PlaceSearch, type PlaceOption } from "./place-search";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";

type SavedPlace = { id: string; label: string; kind: "home" | "work" | "custom"; address: string | null; latitude: number; longitude: number };
type Draft = { latitude: number; longitude: number; placeId: string | null; address: string | null; source: "search" | "gps" };

const icons = { home: House, work: Briefcase, custom: MapPin };

export function SavedPlaces() {
  const t = useTranslations("savedPlaces");
  const [places, setPlaces] = useState<SavedPlace[] | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<SavedPlace["kind"]>("custom");
  const [busy, setBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const [formError, setFormError] = useState<ApiFailure | null>(null);

  const [refresh, setRefresh] = useState(0);
  const reload = () => setRefresh((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me/saved-places", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setFailure(await readFailure(response));
          setPlaces([]);
          return;
        }
        setFailure(null);
        setPlaces((await response.json()).places);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailure({ message: t("offline") });
        setPlaces([]);
      });
    return () => controller.abort();
  }, [refresh, t]);

  function useGps() {
    if (!navigator.geolocation) {
      setGpsMessage(t("gpsUnsupported"));
      return;
    }
    setGpsMessage(t("gpsLocating"));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft({ latitude: position.coords.latitude, longitude: position.coords.longitude, placeId: null, address: null, source: "gps" });
        setGpsMessage(t("gpsReady"));
      },
      (error) => setGpsMessage(error.code === error.PERMISSION_DENIED ? t("gpsDenied") : t("gpsFailed")),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save() {
    if (!draft || !label.trim() || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const response = await fetch("/api/me/saved-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, kind, placeId: draft.placeId, address: draft.address, latitude: draft.latitude, longitude: draft.longitude }),
      });
      if (!response.ok) {
        setFormError(await readFailure(response));
        return;
      }
      setDraft(null);
      setLabel("");
      setKind("custom");
      setGpsMessage("");
      reload();
    } catch {
      setFormError({ message: t("offline") });
    } finally {
      setBusy(false);
    }
  }

  async function remove(place: SavedPlace) {
    const response = await fetch(`/api/me/saved-places/${place.id}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      setFormError(response ? await readFailure(response) : { message: t("offline") });
      return;
    }
    reload();
  }

  return (
    <main className="driver-page">
      <div className="driver-page-heading">
        <div>
          <h1>{t("title")}</h1>
          <p className="driver-small">{t("subtitle")}</p>
        </div>
      </div>
      {failure ? <SetupNotice failure={failure} /> : (
        <>
          <section className="driver-section" aria-labelledby="saved-places-add">
            <h2 id="saved-places-add">{t("addTitle")}</h2>
            <PlaceSearch
              label={t("searchLabel")}
              onSelect={(place: PlaceOption) => {
                setDraft({ latitude: place.latitude, longitude: place.longitude, placeId: place.id, address: place.nameEn, source: "search" });
                if (!label) setLabel(place.nameEn.slice(0, 60));
              }}
            />
            <div className="driver-actions">
              <button type="button" className="driver-secondary" onClick={useGps}><Crosshair />{t("useGps")}</button>
              {gpsMessage && <span className="driver-small" role="status">{gpsMessage}</span>}
            </div>
            {draft && (
              <div className="driver-form-grid">
                <label>{t("label")}<input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} /></label>
                <label>{t("kind")}
                  <select value={kind} onChange={(event) => setKind(event.target.value as SavedPlace["kind"])}>
                    <option value="home">{t("kinds.home")}</option>
                    <option value="work">{t("kinds.work")}</option>
                    <option value="custom">{t("kinds.custom")}</option>
                  </select>
                </label>
                <p className="driver-small">{draft.source === "gps" ? t("fromGps") : t("fromSearch", { name: draft.address ?? "" })}</p>
                <div className="driver-actions">
                  <button type="button" className="driver-primary" disabled={busy || !label.trim()} onClick={save}>{busy ? t("saving") : t("save")}</button>
                </div>
              </div>
            )}
            {formError && <SetupNotice failure={formError} />}
          </section>
          <section className="driver-section" aria-labelledby="saved-places-list">
            <h2 id="saved-places-list">{t("listTitle")}</h2>
            {places === null ? <div className="driver-loading" role="status">{t("loading")}</div>
              : !places.length ? <p className="driver-empty">{t("empty")}</p>
              : (
                <div className="driver-record-list">
                  {places.map((place) => {
                    const Icon = icons[place.kind];
                    return (
                      <article className="driver-record" key={place.id}>
                        <Icon aria-hidden="true" />
                        <div>
                          <h3>{place.label}</h3>
                          <p>{t(`kinds.${place.kind}`)}{place.address ? ` · ${place.address}` : ""}</p>
                        </div>
                        <div className="driver-actions">
                          <button type="button" className="driver-secondary" onClick={() => remove(place)} aria-label={t("remove", { label: place.label })}><Trash /></button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
          </section>
        </>
      )}
    </main>
  );
}
