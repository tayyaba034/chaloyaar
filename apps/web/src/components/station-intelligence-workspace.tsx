"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, Crosshair, Cube, Exam, Globe, UsersThree } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { stationAreas } from "@/lib/station-search";
import { straightLineKm } from "@geo/distance.ts";
import { TrueCostMap, type HexLayer } from "./truecost-map";
import { AssistantPanel } from "./assistant-panel";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";
import "./station-intelligence.css";

type AreaId = keyof typeof stationAreas;
type Station = { id: string; name: string; latitude: number; longitude: number; supportedFuels: string[]; verificationStatus: string };
type Collection = { type: "FeatureCollection"; features: Array<{ properties: Record<string, number | string> }> };
type Intelligence = {
  stationHexes: Collection;
  reportHexes: Collection;
  stats: { stations: number; stationsWithFuelData: number; verifiedStations: number; reports: number; freshReports: number; conflictingStations: number; lastReportAt: string | null };
  stations: Station[];
  hexSizeMetres: number;
  sources: string[];
  generatedAt: string;
};

const areas = Object.keys(stationAreas) as AreaId[];
const windows = [24, 168, 336] as const;

// Every number and shape on this page comes from /api/stations/intelligence (real database rows).
export function StationIntelligenceWorkspace() {
  const t = useTranslations("intelligence");
  const stationsT = useTranslations("stations");
  const [area, setArea] = useState<AreaId>("city-centre");
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsMessage, setGpsMessage] = useState("");
  const [layer, setLayer] = useState<"stations" | "reports">("stations");
  const [hours, setHours] = useState<(typeof windows)[number]>(24);
  const [fuel, setFuel] = useState<"all" | "petrol" | "diesel" | "cng">("all");
  const [threeD, setThreeD] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [radiusKm, setRadiusKm] = useState(5);
  const [data, setData] = useState<Intelligence | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/stations/intelligence?hours=${hours}&fuel=${fuel}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setFailure(await readFailure(response));
          return;
        }
        setFailure(null);
        setData(await response.json());
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailure({ message: t("offline") });
      });
    return () => controller.abort();
  }, [hours, fuel, t]);

  const center = useMemo(() => origin ?? stationAreas[area], [origin, area]);
  const markers = useMemo(() => (!showPins ? [] : (data?.stations ?? [])).map((station) => ({
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    warning: station.verificationStatus === "verified" ? undefined : t("unverifiedMarker"),
  })), [data, t, showPins]);
  const hexLayer = useMemo<HexLayer | null>(() => {
    if (!data) return null;
    const collection = layer === "stations" ? data.stationHexes : data.reportHexes;
    const property = layer === "stations" ? "stations" : "reports";
    if (!collection.features.length) return null;
    const max = Math.max(...collection.features.map((feature) => Number(feature.properties[property]) || 0));
    return { data: collection, property, max, color: layer === "stations" ? "olive" : "rust" };
  }, [data, layer]);
  const radius = useMemo(() => ({ center, km: radiusKm }), [center, radiusKm]);
  const inRadius = useMemo(() => (data?.stations ?? []).filter((station) => straightLineKm(center, station) <= radiusKm).length, [data, center, radiusKm]);

  function useGps() {
    if (!navigator.geolocation) {
      setGpsMessage(t("gpsUnsupported"));
      return;
    }
    setGpsMessage(t("gpsLocating"));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setGpsMessage("");
      },
      (error) => setGpsMessage(error.code === error.PERMISSION_DENIED ? t("gpsDenied") : t("gpsFailed")),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const stats = data?.stats;
  const formatTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PK", { timeZone: "Asia/Karachi" }) : t("never"));

  return (
    <main className="si-page">
      <header className="si-header">
        <p className="si-eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </header>

      <section className="si-card si-controls" aria-label={t("controls")}>
        <label>{t("area")}
          <select value={origin ? "gps" : area} onChange={(event) => { setOrigin(null); setArea(event.target.value as AreaId); }}>
            {origin && <option value="gps">{t("myLocation")}</option>}
            {areas.map((id) => <option key={id} value={id}>{stationsT(`areas.${id}`)}</option>)}
          </select>
        </label>
        <button type="button" className="si-secondary" onClick={useGps}><Crosshair aria-hidden="true" />{t("useGps")}</button>
        <label>{t("layer")}
          <select value={layer} onChange={(event) => setLayer(event.target.value as typeof layer)}>
            <option value="stations">{t("layers.stations")}</option>
            <option value="reports">{t("layers.reports")}</option>
          </select>
        </label>
        <label>{t("fuel")}
          <select value={fuel} onChange={(event) => setFuel(event.target.value as typeof fuel)}>
            {(["all", "petrol", "diesel", "cng"] as const).map((value) => <option key={value} value={value}>{t(`fuels.${value}`)}</option>)}
          </select>
        </label>
        {layer === "reports" && (
          <label>{t("window")}
            <select value={hours} onChange={(event) => setHours(Number(event.target.value) as typeof hours)}>
              {windows.map((value) => <option key={value} value={value}>{t(`windows.${value}`)}</option>)}
            </select>
          </label>
        )}
        <label className="si-range">{t("radius", { km: radiusKm })}
          <input type="range" min={1} max={15} value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} />
        </label>
        <label className="si-check">
          <input type="checkbox" checked={showPins} onChange={(event) => setShowPins(event.target.checked)} />
          {t("showPins")}
        </label>
        <label className="si-check">
          <input type="checkbox" checked={threeD} onChange={(event) => setThreeD(event.target.checked)} />
          <Cube aria-hidden="true" />{t("threeD")}
        </label>
        {gpsMessage && <p className="si-note" role="status">{gpsMessage}</p>}
      </section>

      {failure && <SetupNotice failure={failure} />}
      {!data && !failure && <div className="si-card si-loading" role="status">{t("loading")}</div>}

      {data && stats && (
        <>
          <section className="si-stats" aria-label={t("statsLabel")}>
            <div><span>{t("stats.stations")}</span><strong>{stats.stations}</strong><small>{t("stats.stationsNote", { withFuel: stats.stationsWithFuelData })}</small></div>
            <div><span>{t("stats.verified")}</span><strong>{stats.verifiedStations}</strong><small>{t("stats.verifiedNote")}</small></div>
            <div><span>{t("stats.inRadius", { km: radiusKm })}</span><strong>{inRadius}</strong><small>{t("stats.inRadiusNote")}</small></div>
            <div><span>{t("stats.fresh")}</span><strong>{stats.freshReports}</strong><small>{t("stats.freshNote", { total: stats.reports })}</small></div>
            <div><span>{t("stats.conflicts")}</span><strong className={stats.conflictingStations ? "si-warning" : ""}>{stats.conflictingStations}</strong><small>{t("stats.conflictsNote")}</small></div>
            <div><span>{t("stats.lastReport")}</span><strong className="si-small-value">{formatTime(stats.lastReportAt)}</strong><small>{t("stats.lastReportNote")}</small></div>
          </section>

          <section className="si-card si-map-card">
            <div className="si-map-heading">
              <h2>{layer === "stations" ? t("layers.stations") : t("layers.reports")}</h2>
              {hexLayer && (
                <div className="si-legend" aria-label={t("legend")}>
                  <span>0</span><i className={`si-legend-bar si-legend-bar--${hexLayer.color}`} /><span>{hexLayer.max}</span>
                  <small>{t("legendNote", { metres: data.hexSizeMetres })}</small>
                </div>
              )}
            </div>
            {layer === "reports" && !data.reportHexes.features.length && (
              <div className="si-empty" role="status">
                <strong>{t("noReportsTitle")}</strong>
                <p>{t("noReportsBody", { window: t(`windows.${hours}`) })}</p>
                <Link className="si-secondary" href="/app/stations">{t("reportLink")}</Link>
              </div>
            )}
            <div className="si-map">
              <TrueCostMap center={center} markers={markers} userLocation={origin} hexLayer={hexLayer} threeD={threeD} radius={radius} />
            </div>
            <p className="si-note">{threeD ? t("threeDNote") : t("radiusNote")} {t("updated", { time: formatTime(data.generatedAt) })}</p>
            <p className="si-note" lang="en" dir="ltr">{data.sources.join(" · ")}</p>
          </section>
        </>
      )}

      <AssistantPanel origin={origin} />

      <section className="si-card" aria-labelledby="si-not-built">
        <h2 id="si-not-built">{t("notBuiltTitle")}</h2>
        <p className="si-note">{t("notBuiltBody")}</p>
        <ul className="si-not-built">
          <li><UsersThree aria-hidden="true" /><div><strong>{t("planned.coverage")}</strong><span>{t("planned.coverageNote")}</span></div></li>
          <li><Bell aria-hidden="true" /><div><strong>{t("planned.alerts")}</strong><span>{t("planned.alertsNote")}</span></div></li>
          <li><Globe aria-hidden="true" /><div><strong>{t("planned.cesium")}</strong><span>{t("planned.cesiumNote")}</span></div></li>
          <li><Exam aria-hidden="true" /><div><strong>{t("planned.evaluation")}</strong><span>{t("planned.evaluationNote")}</span></div></li>
        </ul>
        <Link className="si-secondary" href="/app/features">{t("featuresLink")}</Link>
      </section>
    </main>
  );
}
